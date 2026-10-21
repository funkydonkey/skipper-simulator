import { rollChance } from './chance';
import { buildConditionContext, evaluateCondition } from './expr';
import { appendLog } from './log';
import { applyOutcome } from './resources';
import { requireBoat } from './state';
import type { Boat, BrokenEffect, Content, EventPhase, GameState, SystemDef, SystemFailure, SystemId, SystemState } from './types';
import { grantXp } from './xp';

export function initialSystems(boat: Boat): Record<SystemId, SystemState> {
  return Object.fromEntries(Object.entries(boat.systems).map(([id, state]) => [id, { state, wear: 0, broken: false }]));
}

/** `system.<id>.state|broken|wear` for every system in content; absent from the boat reads as 'none' / false / 0. */
export function systemContext(state: GameState, content: Content): Record<string, string | number | boolean> {
  const ctx: Record<string, string | number | boolean> = {};
  for (const def of content.systems) {
    const s = state.systems[def.id];
    ctx[`system.${def.id}.state`] = s?.state ?? 'none';
    ctx[`system.${def.id}.broken`] = s?.broken ?? false;
    ctx[`system.${def.id}.wear`] = s?.wear ?? 0;
  }
  return ctx;
}

/** Applies break / repair / wear from an effect. Systems the boat lacks are ignored. */
export function applySystemEffect(
  systems: Record<SystemId, SystemState>,
  e: { break?: SystemId; repair?: SystemId; wear?: Record<SystemId, number> },
): Record<SystemId, SystemState> {
  if (!e.break && !e.repair && !e.wear) return systems;
  const next: Record<SystemId, SystemState> = { ...systems };
  const patch = (id: SystemId, f: (s: SystemState) => SystemState): void => {
    const cur = next[id];
    if (cur) next[id] = f(cur);
  };
  if (e.break) patch(e.break, (s) => ({ ...s, broken: true }));
  if (e.repair) patch(e.repair, (s) => ({ ...s, broken: false }));
  for (const [id, w] of Object.entries(e.wear ?? {})) patch(id, (s) => ({ ...s, wear: s.wear + w }));
  return next;
}

export type BrokenFlags = Required<Pick<BrokenEffect, 'noMotor' | 'noSail' | 'noCharge' | 'noCook'>>;

/** Defs of the systems that are broken right now, in content order. */
export function brokenSystems(state: GameState, content: Content): SystemDef[] {
  return content.systems.filter((d) => state.systems[d.id]?.broken);
}

/** OR of the boolean effects over all broken systems. */
export function brokenFlags(state: GameState, content: Content): BrokenFlags {
  const flags: BrokenFlags = { noMotor: false, noSail: false, noCharge: false, noCook: false };
  for (const { brokenEffect: e } of brokenSystems(state, content)) {
    flags.noMotor ||= e.noMotor === true;
    flags.noSail ||= e.noSail === true;
    flags.noCharge ||= e.noCharge === true;
    flags.noCook ||= e.noCook === true;
  }
  return flags;
}

export type WearSource = 'motor_hour' | 'sail_hour' | 'night' | 'anchoring';

/** Adds `amount x wearPer[source]` to every system on the boat that defines that source. */
export function addWear(state: GameState, content: Content, source: WearSource, amount: number): GameState {
  const wear: Record<SystemId, number> = {};
  for (const def of content.systems) {
    const per = def.wearPer?.[source];
    if (per !== undefined && state.systems[def.id]) wear[def.id] = amount * per;
  }
  if (amount === 0 || Object.keys(wear).length === 0) return state;
  return { ...state, systems: applySystemEffect(state.systems, { wear }) };
}

/** Ids of events that only boat systems may queue; the generic event roll skips them. */
export function failureEventIds(content: Content): Set<string> {
  return new Set(content.systems.flatMap((d) => d.failures.flatMap((f) => (f.event ? [f.event] : []))));
}

/** A failure event already waiting, or already fired while `once` (default), cannot be queued again. */
function eventBlocked(state: GameState, content: Content, eventId: string): boolean {
  if (state.eventQueue.includes(eventId)) return true;
  const once = content.events.find((e) => e.id === eventId)?.trigger.once;
  return once !== false && state.firedEvents.includes(eventId);
}

function rollFailure(state: GameState, content: Content, def: SystemDef, f: SystemFailure): { state: GameState; hit: boolean } {
  const ctx = buildConditionContext(state, content);
  const r = rollChance(state.rng, f.chance, ctx);
  let s = appendLog({ ...state, rng: r.next }, {
    kind: 'roll', cause: `roll:failure:${def.id}:${f.id}`, pillar: 'boat', odds: r.value.odds, data: { hit: r.value.hit },
  });
  if (!r.value.hit) return { state: s, hit: false };
  const cause = `fault:${def.id}:${f.id}`;
  s = applyOutcome(s, requireBoat(content, s), { cause, pillar: 'boat', effect: f.effect ?? {}, odds: r.value.odds });
  return { state: f.xp ? grantXp(s, f.xp, cause, content.balance) : s, hit: true };
}

/**
 * One roll per eligible failure (content order). The first failure that names an event takes the phase's slot:
 * later failures do not roll and the event id is returned for `queueEvent` to queue.
 */
export function rollFailures(state: GameState, content: Content, phase: EventPhase): { state: GameState; queuedEvent?: string } {
  let s = state;
  for (const def of content.systems) {
    for (const f of def.failures) {
      const sys = s.systems[def.id];
      if (!sys || sys.broken || f.phase !== phase) continue;
      if (f.event !== undefined && eventBlocked(s, content, f.event)) continue;
      if (f.when !== undefined && !evaluateCondition(f.when, buildConditionContext(s, content))) continue;
      const r = rollFailure(s, content, def, f);
      s = r.state;
      if (r.hit && f.event) return { state: s, queuedEvent: f.event };
    }
  }
  return { state: s };
}
