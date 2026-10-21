import type { BerthType, Content, DayPlan, GameState, LegPlan, ShowerDiscipline } from '../../../engine';
import { routeBetween, routesFrom } from '../../view/map';

export interface Draft { legs: LegPlan[]; departureHour: number; swimStops: number; shower: ShowerDiscipline; autopilot: boolean; berth?: BerthType }

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

/** A fresh draft, or the plan taken back from the maneuvers screen (`from`). */
export function initialDraft(game: GameState, content: Content, from: DayPlan | null = null): Draft {
  const departures = departureOptions(game, content);
  const firstSlot = departures[0] ?? content.balance.time.earliestDepartureHour;
  if (!from) return { legs: [], departureHour: firstSlot, swimStops: 0, shower: 'normal', autopilot: false };
  const departureHour = departures.includes(from.departureHour) ? from.departureHour : firstSlot;
  return { legs: [...from.legs], departureHour, swimStops: from.swimStops, shower: from.shower, autopilot: from.autopilot, ...(from.berth ? { berth: from.berth } : {}) };
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
  return withoutBerth({ ...draft, legs: [...draft.legs, { routeId: route.id, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }] });
}

/** A berth belongs to one destination, so changing the route clears it. */
function withoutBerth({ berth: _berth, ...rest }: Draft): Draft { return rest; }

export const removeLastLeg = (d: Draft): Draft => withoutBerth({ ...d, legs: d.legs.slice(0, -1) });

export const updateLeg = (d: Draft, i: number, patch: Partial<LegPlan>): Draft =>
  ({ ...d, legs: d.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

export const toDayPlan = (d: Draft): DayPlan =>
  ({ departureHour: d.departureHour, legs: d.legs, swimStops: d.swimStops, shower: d.shower, autopilot: d.legs.length > 0 && d.autopilot, ...(d.legs.length > 0 && d.berth ? { berth: d.berth } : {}) });
