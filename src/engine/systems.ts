import type { Boat, Content, GameState, SystemId, SystemState } from './types';

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
