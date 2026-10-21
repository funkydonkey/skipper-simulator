import type { Balance, GameState, SystemId } from '../engine/types';

type Targets = Balance['simTargets'];

/** True when the week's log shows one of the boat's known failure causes. */
export function weaknessHit(state: GameState, boatId: string, targets: Targets): boolean {
  const causes = targets.weakness[boatId]?.causes ?? [];
  return state.log.some((e) => causes.some((c) => e.cause.startsWith(c)));
}

export function weakSystems(boatId: string, targets: Targets): SystemId[] {
  return targets.weakness[boatId]?.systems ?? [];
}
