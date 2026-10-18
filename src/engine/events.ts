import { EngineError } from './errors';
import { buildConditionContext, evaluateAll, type CondContext } from './expr';
import { appendLog } from './log';
import { sayDialogue } from './promises';
import { applyOutcomes } from './resources';
import { chance, type RngResult } from './rng';
import { requireBoat, requireEvent } from './state';
import type { Balance, Content, EventOption, EventPhase, GameEvent, GameState, Outcome, Pillar, VoiceId } from './types';
import { audibleLines, checkChance, rollCheck } from './voices';

export interface EventView {
  id: string;
  scene: string;
  text: string;
  voices: Array<{ voice: VoiceId; text: string }>;
  options: Array<{ id: string; text: string; available: boolean; chance: number | null }>;
}

export function pillarWeight(day: number, pillar: Pillar, b: Balance): number {
  return b.drama.pillarWeightByDay[String(day)]?.[pillar] ?? 1;
}

export function eligibleEvents(content: Content, state: GameState, phase: EventPhase, ctx: CondContext): GameEvent[] {
  return content.events.filter((e) =>
    e.trigger.phase === phase
    && (e.trigger.once === false || !state.firedEvents.includes(e.id))
    && !state.eventQueue.includes(e.id)
    && evaluateAll(e.trigger.conditions, ctx));
}

export function rollEvent(rng: number, content: Content, state: GameState, phase: EventPhase, ctx: CondContext): RngResult<GameEvent | null> {
  let next = rng;
  for (const e of eligibleEvents(content, state, phase, ctx)) {
    const r = chance(next, Math.min(1, e.trigger.chance * pillarWeight(state.day, e.pillar, content.balance)));
    next = r.next;
    if (r.value) return { value: e, next };
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
): RngResult<{ outcomes: Outcome[]; check: { success: boolean; chance: number } | null }> {
  const o = event.options.find((x) => x.id === optionId);
  if (!o) throw new EngineError('NOT_FOUND', `Option "${optionId}" not found in event ${event.id}`);
  if (!optionAvailable(o, ctx)) throw new EngineError('INVALID_INPUT', `Option "${optionId}" is not available now`);
  const cause = `event:${event.id}:${o.id}`;
  if (o.check) {
    const r = rollCheck(rng, state.voices[o.check.voice], o.check.difficulty, state.resources.fatigue, b);
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
    voices: audibleLines(event.voices, state.voices).map((l) => ({ voice: l.voice, text: l.text[lang] })),
    options: event.options.map((o) => ({
      id: o.id,
      text: o.text[lang],
      available: optionAvailable(o, ctx),
      chance: o.check ? checkChance(state.voices[o.check.voice], o.check.difficulty, state.resources.fatigue, b) : null,
    })),
  };
}

export function queueEvent(state: GameState, content: Content, phase: EventPhase): GameState {
  const r = rollEvent(state.rng, content, state, phase, buildConditionContext(state, content));
  const s = { ...state, rng: r.next };
  if (!r.value) return s;
  const ev = r.value;
  return appendLog(
    { ...s, eventQueue: [...s.eventQueue, ev.id], firedEvents: [...s.firedEvents, ev.id] },
    { kind: 'event', cause: `event:${ev.id}`, pillar: ev.pillar },
  );
}

export function resolvePendingEvent(state: GameState, content: Content, optionId: string): GameState {
  const id = state.eventQueue[0];
  if (!id) throw new EngineError('INVALID_INPUT', 'No pending event');
  const ev = requireEvent(content, id);
  const r = resolveOption(state.rng, ev, optionId, state, buildConditionContext(state, content), content.balance);
  let s: GameState = appendLog({ ...state, rng: r.next, eventQueue: state.eventQueue.slice(1) }, { kind: 'decision', cause: `choice:${ev.id}:${optionId}`, pillar: ev.pillar });
  if (r.value.check) {
    s = appendLog(s, { kind: 'check', cause: `check:${ev.id}:${optionId}`, pillar: ev.pillar, data: { success: r.value.check.success, chance: r.value.check.chance } });
  }
  s = applyOutcomes(s, requireBoat(content, s), r.value.outcomes);
  const context = ev.trigger.phase === 'morning' ? 'morning' : 'evening';
  for (const o of r.value.outcomes) if (o.effect.promise) s = sayDialogue(s, content, o.effect.promise, context);
  return s;
}
