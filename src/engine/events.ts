import { rollChance } from './chance';
import { EngineError } from './errors';
import { buildConditionContext, evaluateAll, type CondContext } from './expr';
import { appendLog } from './log';
import { eventTriggerSpec } from './odds';
import { sayDialogue } from './promises';
import { applyOutcomes } from './resources';
import type { RngResult } from './rng';
import { requireBoat, requireEvent } from './state';
import { failureEventIds, rollFailures } from './systems';
import { grantCheckXp } from './xp';
import type { Balance, ChanceValue, Content, EventOption, EventPhase, GameEvent, GameState, Outcome, VoiceId } from './types';
import { audibleLines, checkChance, rollCheck } from './voices';

export { pillarWeight } from './odds';

export interface EventView {
  id: string;
  scene: string;
  text: string;
  voices: Array<{ voice: VoiceId; text: string }>;
  options: Array<{ id: string; text: string; available: boolean; chance: ChanceValue | null }>;
}

export function eligibleEvents(content: Content, state: GameState, phase: EventPhase, ctx: CondContext): GameEvent[] {
  const reserved = failureEventIds(content);
  return content.events.filter((e) =>
    !reserved.has(e.id)
    && e.trigger.phase === phase
    && (e.trigger.once === false || !state.firedEvents.includes(e.id))
    && !state.eventQueue.includes(e.id)
    && evaluateAll(e.trigger.conditions, ctx));
}

export function rollEvent(rng: number, content: Content, state: GameState, phase: EventPhase, ctx: CondContext): RngResult<GameEvent | null> {
  let next = rng;
  for (const e of eligibleEvents(content, state, phase, ctx)) {
    const r = rollChance(next, eventTriggerSpec(e, state.day, content.balance), ctx);
    next = r.next;
    if (r.value.hit) return { value: e, next };
  }
  return { value: null, next };
}

export const optionAvailable = (o: EventOption, ctx: CondContext): boolean => evaluateAll(o.requires ?? [], ctx);

export function resolveOption(
  rng: number,
  event: GameEvent,
  optionId: string,
  state: GameState,
  ctx: CondContext,
  b: Balance,
): RngResult<{ outcomes: Outcome[]; check: { success: boolean; odds: ChanceValue } | null }> {
  const o = event.options.find((x) => x.id === optionId);
  if (!o) throw new EngineError('NOT_FOUND', `Option "${optionId}" not found in event ${event.id}`);
  if (!optionAvailable(o, ctx)) throw new EngineError('INVALID_INPUT', `Option "${optionId}" is not available now`);
  const cause = `event:${event.id}:${o.id}`;
  if (o.check) {
    const r = rollCheck(rng, o.check, ctx, b);
    const tag = r.value.success ? 'success' : 'fail';
    const effect = (r.value.success ? o.success : o.fail) ?? {};
    return { value: { outcomes: [{ cause: `${cause}:${tag}`, pillar: event.pillar, effect }], check: r.value }, next: r.next };
  }
  return { value: { outcomes: [{ cause, pillar: event.pillar, effect: o.effects ?? {} }], check: null }, next: rng };
}

export function presentEvent(event: GameEvent, state: GameState, ctx: CondContext, b: Balance): EventView {
  const lang = state.lang;
  return {
    id: event.id,
    scene: event.scene,
    text: event.text[lang],
    voices: audibleLines(event.voices, state.voices, ctx).map((l) => ({ voice: l.voice, text: l.text[lang] })),
    options: event.options.map((o) => ({
      id: o.id,
      text: o.text[lang],
      available: optionAvailable(o, ctx),
      chance: o.check ? checkChance(o.check, ctx, b) : null,
    })),
  };
}

function enqueue(state: GameState, ev: GameEvent): GameState {
  return appendLog(
    { ...state, eventQueue: [...state.eventQueue, ev.id], firedEvents: [...state.firedEvents, ev.id] },
    { kind: 'event', cause: `event:${ev.id}`, pillar: ev.pillar },
  );
}

/** At most one event per phase: a system failure that names an event takes the slot before the generic roll. */
export function queueEvent(state: GameState, content: Content, phase: EventPhase): GameState {
  const failures = rollFailures(state, content, phase);
  if (failures.queuedEvent) return enqueue(failures.state, requireEvent(content, failures.queuedEvent));
  const r = rollEvent(failures.state.rng, content, failures.state, phase, buildConditionContext(failures.state, content));
  const s = { ...failures.state, rng: r.next };
  return r.value ? enqueue(s, r.value) : s;
}

export function resolvePendingEvent(state: GameState, content: Content, optionId: string): GameState {
  const id = state.eventQueue[0];
  if (!id) throw new EngineError('INVALID_INPUT', 'No pending event');
  const ev = requireEvent(content, id);
  const r = resolveOption(state.rng, ev, optionId, state, buildConditionContext(state, content), content.balance);
  let s: GameState = appendLog({ ...state, rng: r.next, eventQueue: state.eventQueue.slice(1) }, { kind: 'decision', cause: `choice:${ev.id}:${optionId}`, pillar: ev.pillar });
  const check = r.value.check;
  if (check) {
    s = appendLog(s, {
      kind: 'roll', cause: `roll:check:${ev.id}:${optionId}`, pillar: ev.pillar, odds: check.odds,
      data: { hit: check.success, success: check.success, chance: check.odds.value },
    });
  }
  const option = ev.options.find((x) => x.id === optionId);
  if (check && option?.check) {
    s = grantCheckXp(s, option.check, check.success, `roll:check:${ev.id}:${optionId}`, content.balance, option.xp);
  }
  s = applyOutcomes(s, requireBoat(content, s), r.value.outcomes, content.balance);
  const context = ev.trigger.phase === 'morning' ? 'morning' : 'evening';
  for (const o of r.value.outcomes) if (o.effect.promise) s = sayDialogue(s, content, o.effect.promise, context);
  return s;
}
