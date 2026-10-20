import { EngineError, assertPhase } from './errors';
import { appendLog } from './log';
import { nextInt, type RngResult } from './rng';
import { advanceClock, requireBoat } from './state';
import type { Boat, BoatDefect, Content, GameState, SystemId, SystemState } from './types';

/** One draw for the count (uniform in defectsPerWeek, inclusive), then one draw per pick from what is left in pool order. */
export function pickDefects(rng: number, boat: Boat): RngResult<string[]> {
  const [min, max] = boat.defectsPerWeek;
  const count = nextInt(rng, min, Math.min(max, boat.defectPool.length));
  let state = count.next;
  const left = boat.defectPool.map((d) => d.id);
  const picked: string[] = [];
  for (let i = 0; i < count.value; i++) {
    const r = nextInt(state, 0, left.length - 1);
    state = r.next;
    picked.push(left.splice(r.value, 1)[0]!);
  }
  return { value: picked, next: state };
}

/** The systems of the picked defects start the week 'worn'. Systems the boat lacks are ignored. */
export function applyDefects(systems: Record<SystemId, SystemState>, boat: Boat, ids: readonly string[]): Record<SystemId, SystemState> {
  const next = { ...systems };
  for (const d of boat.defectPool) {
    const cur = d.system ? next[d.system] : undefined;
    if (ids.includes(d.id) && d.system && cur) next[d.system] = { ...cur, state: 'worn' };
  }
  return next;
}

type Fix = BoatDefect & { system: SystemId; fixEur: number; fixMin: number };

function fixable(boat: Boat, found: readonly string[], fixIds: readonly string[]): Fix[] {
  if (new Set(fixIds).size !== fixIds.length) throw new EngineError('INVALID_INPUT', 'duplicate fix ids');
  return fixIds.map((id) => {
    const d = boat.defectPool.find((x) => x.id === id);
    if (!d || !found.includes(id) || !d.system) throw new EngineError('INVALID_INPUT', `defect "${id}" cannot be fixed`);
    return { ...d, system: d.system, fixEur: d.fixEur ?? 0, fixMin: d.fixMin ?? 0 };
  });
}

/** Fix the chosen found defects at base (euros and minutes), sail on with the rest. */
export function resolveDefects(state: GameState, content: Content, fixIds: readonly string[]): GameState {
  assertPhase(state, 'defects');
  const boat = requireBoat(content, state);
  const checkin = state.checkin;
  if (!checkin) throw new EngineError('WRONG_PHASE', 'No check-in in progress');
  const fixes = fixable(boat, checkin.found, fixIds);
  const minutes = fixes.reduce((sum, d) => sum + d.fixMin, 0);
  const eur = fixes.reduce((sum, d) => sum + d.fixEur, 0);
  if (minutes > checkin.minutesLeft) throw new EngineError('BUDGET', `Fixes take ${minutes} min, ${checkin.minutesLeft} left`);
  if (eur > state.resources.moneyEur) throw new EngineError('NO_MONEY', `Fixes cost ${eur} EUR`);

  const remaining = state.defects.filter((id) => !fixIds.includes(id));
  // A system stays worn while another unfixed defect of this week still maps to it.
  const stillWorn = new Set(boat.defectPool.filter((d) => remaining.includes(d.id) && d.system).map((d) => d.system));
  let s: GameState = state;
  for (const d of fixes) {
    const systems = stillWorn.has(d.system) ? s.systems : { ...s.systems, [d.system]: { state: 'ok' as const, wear: 0, broken: false } };
    s = { ...s, systems, resources: { ...s.resources, moneyEur: s.resources.moneyEur - d.fixEur } };
    s = appendLog(s, { kind: 'effect', cause: `checkin:fix:${d.id}`, pillar: 'boat', delta: { moneyEur: -d.fixEur } });
  }
  for (const id of checkin.found) {
    if (!fixIds.includes(id) && boat.defectPool.find((d) => d.id === id)?.system) s = appendLog(s, { kind: 'decision', cause: `checkin:sail_on:${id}`, pillar: 'boat' });
  }
  return {
    ...advanceClock(s, minutes),
    defects: remaining,
    checkin: { ...checkin, fixed: [...fixIds], minutesLeft: checkin.minutesLeft - minutes },
    phase: 'briefing',
  };
}
