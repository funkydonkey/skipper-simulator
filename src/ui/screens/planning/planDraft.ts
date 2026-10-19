import type { Content, DayPlan, GameState, LegPlan, ShowerDiscipline } from '../../../engine';
import { routeBetween, routesFrom } from '../../view/map';

export interface Draft { legs: LegPlan[]; departureHour: number; swimStops: number; shower: ShowerDiscipline; autopilot: boolean }

const STEP_HOURS = 0.5;
const MIN_PER_HOUR = 60;

/** Half-hour slots from max(earliest, now) up to (not including) sunset. Empty = too late to leave. */
export function departureOptions(game: GameState, content: Content): number[] {
  const t = content.balance.time;
  const now = Math.ceil(game.clockMin / MIN_PER_HOUR / STEP_HOURS) * STEP_HOURS;
  const out: number[] = [];
  for (let h = Math.max(t.earliestDepartureHour, now); h < t.sunsetHour; h += STEP_HOURS) out.push(h);
  return out;
}

export function initialDraft(game: GameState, content: Content): Draft {
  return { legs: [], departureHour: departureOptions(game, content)[0] ?? content.balance.time.earliestDepartureHour, swimStops: 0, shower: 'normal', autopilot: false };
}

export function trailOf(content: Content, from: string, legs: readonly LegPlan[]): string[] {
  const out = [from];
  for (const leg of legs) {
    const at = out[out.length - 1]!;
    const r = content.routes.find((x) => x.id === leg.routeId);
    const next = r ? (r.from === at ? r.to : r.to === at ? r.from : null) : null;
    if (!next) break;
    out.push(next);
  }
  return out;
}

export function reachableFrom(content: Content, game: GameState, draft: Draft): string[] {
  const trail = trailOf(content, game.locationId, draft.legs);
  return routesFrom(content, trail[trail.length - 1]!).map((r) => r.to.id);
}

export function addLeg(content: Content, game: GameState, draft: Draft, toId: string): Draft {
  const trail = trailOf(content, game.locationId, draft.legs);
  const route = routeBetween(content, trail[trail.length - 1]!, toId);
  if (!route) return draft;
  return { ...draft, legs: [...draft.legs, { routeId: route.id, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }] };
}

export const removeLastLeg = (d: Draft): Draft => ({ ...d, legs: d.legs.slice(0, -1) });

export const updateLeg = (d: Draft, i: number, patch: Partial<LegPlan>): Draft =>
  ({ ...d, legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

export const toDayPlan = (d: Draft): DayPlan =>
  ({ departureHour: d.departureHour, legs: d.legs, swimStops: d.swimStops, shower: d.shower, autopilot: d.legs.length > 0 && d.autopilot });
