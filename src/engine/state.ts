import { EngineError } from './errors';
import type { Boat, Content, Dialogue, GameEvent, GameState, MapPoint, Route, WeatherTemplate } from './types';

function find<T extends { id: string }>(items: readonly T[], id: string, what: string): T {
  const item = items.find((i) => i.id === id);
  if (!item) throw new EngineError('NOT_FOUND', `${what} "${id}" not found`);
  return item;
}

export function requireBoat(content: Content, state: GameState): Boat {
  if (!state.boatId) throw new EngineError('INVALID_INPUT', 'No boat chosen yet');
  return find(content.boats, state.boatId, 'Boat');
}
export const requirePoint = (c: Content, id: string): MapPoint => find(c.map, id, 'Point');
export const requireRoute = (c: Content, id: string): Route => find(c.routes, id, 'Route');
export const requireTemplate = (c: Content, id: string): WeatherTemplate => find(c.weather, id, 'Weather template');
export const requireDialogue = (c: Content, id: string): Dialogue => find(c.dialogues, id, 'Dialogue');
export const requireEvent = (c: Content, id: string): GameEvent => find(c.events, id, 'Event');

/** Routes are bidirectional: returns the far end, or null if the route doesn't touch pointId. */
export function otherEnd(route: Route, pointId: string): string | null {
  if (route.from === pointId) return route.to;
  if (route.to === pointId) return route.from;
  return null;
}

export function advanceClock(state: GameState, minutes: number): GameState {
  return { ...state, clockMin: state.clockMin + Math.round(minutes) };
}

export const round1 = (n: number): number => Math.round(n * 10) / 10;
export const round2 = (n: number): number => Math.round(n * 100) / 100;
export const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
