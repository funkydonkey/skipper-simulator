import { rollChance } from './chance';
import { renderText } from './crew';
import { EngineError } from './errors';
import { buildConditionContext, evaluateAll, type CondContext } from './expr';
import { appendLog } from './log';
import { eventTriggerSpec } from './odds';
import { sayDialogue } from './promises';
import { applyOutcomes } from './resources';
import type { RngResult } from './rng';
import { seedHash } from './seed';
import { requireBoat, requireEvent } from './state';
import { failureEventIds, rollFailures } from './systems';
import { grantCheckXp } from './xp';
import type { Balance, ChanceValue, Content, EventOption, EventPhase, GameEvent, GameState, LocalizedText, Outcome, VoiceId } from './types';
import { audibleLines, checkChance, rollCheck } from './voices';

export { pillarWeight } from './odds';

export interface EventView {
  id: string;
  scene: string;
  text: string;
  voices: Array<{ voice: VoiceId; text: string }>;
  options: Array<{ id: string; text: string; available: boolean; chance: ChanceValue | null }>;
}

const WEEK_DAYS = 7;

/** Log entries `{ kind: 'event', cause: 'event:<id>' }`: the only record of past firings (R5). */
function firings(state: GameState, id: string): number[] {
  return state.log.filter((e) => e.kind === 'event' && e.cause === `event:${id}`).map((e) => e.day);
}

function offCooldown(e: GameEvent, state: GameState): boolean {
  const { cooldownDays, maxPerWeek } = e.trigger;
  if (cooldownDays === undefined && maxPerWeek === undefined) return true;
  const days = firings(state, e.id);
  if (cooldownDays !== undefined && days.some((d) => d > state.day - cooldownDays)) return false;
  return maxPerWeek === undefined || days.filter((d) => d > state.day - WEEK_DAYS).length < maxPerWeek;
}

/** The event's text, or for variants one picked by seed, id and day (never `state.rng`). */
export function eventText(event: GameEvent, state: Pick<GameState, 'seed' | 'day'>): LocalizedText {
  const t = event.text;
  return Array.isArray(t) ? t[seedHash(state.seed, event.id, state.day) % t.length]! : t;
}

/** Every text the event can show (one, or all variants). */
export const eventTexts = (event: GameEvent): LocalizedText[] => (Array.isArray(event.text) ? event.text : [event.text]);

export function eligibleEvents(content: Content, state: GameState, phase: EventPhase, ctx: CondContext): GameEvent[] {
  const reserved = failureEventIds(content);
  return content.events.filter((e) =>
    !reserved.has(e.id)
    && e.trigger.phase === phase
    && (e.trigger.once === false || !state.firedEvents.includes(e.id))
    && offCooldown(e, state)
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

export function presentEvent(event: GameEvent, state: GameState, ctx: CondContext, content: Content): EventView {
  const b = content.balance;
  const lang = state.lang;
  const render = (text: string): string => renderText(text, state, content, `${event.id}:${state.day}`);
  return {
    id: event.id,
    scene: event.scene,
    text: render(eventText(event, state)[lang]),
    voices: audibleLines(event.voices, state.voices, ctx).map((l) => ({ voice: l.voice, text: render(l.text[lang]) })),
    options: event.options.map((o) => ({
      id: o.id,
      text: render(o.text[lang]),
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

/** Failures stay day-level: they roll once per phase and may name an event; the generic roll is separate. */
export function queueFailureEvent(state: GameState, content: Content, phase: EventPhase): GameState {
  const failures = rollFailures(state, content, phase);
  return failures.queuedEvent ? enqueue(failures.state, requireEvent(content, failures.queuedEvent)) : failures.state;
}

/** One generic passage roll for a leg: the leg's wind, direction and `leg.feature.*` are spread over the day context. */
export function queuePassageEvent(state: GameState, content: Content, legCtx: CondContext): GameState {
  const r = rollEvent(state.rng, content, state, 'passage', { ...buildConditionContext(state, content), ...legCtx });
  const s = { ...state, rng: r.next };
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
