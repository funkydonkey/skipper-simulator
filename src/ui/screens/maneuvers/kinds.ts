import {
  berthForKind, departureKind, forecastStepPool, maneuverFor, otherEnd, requirePoint, requireRoute, situationCondContext, situationHint,
  type Content, type DayPlan, type GameState, type Maneuver, type ManeuverKind, type ManeuverStep, type Situation,
} from '../../../engine';

export interface ManeuverSpec {
  kind: ManeuverKind;
  maneuver: Maneuver;
  fallback: boolean;
  /** Ids of the steps any likely fact may call for (R25: the forecast's uncertainty hedged), in content order: the pool to order. */
  steps: string[];
  /** The conditional step the Order voice points out (Order 3+), or null. */
  hint: ManeuverStep | null;
}

/**
 * The maneuvers the engine may run today, in order (see day/arrival.ts). The forecast situation's berth picks the
 * maneuver of its own kind (as validatePlan and runManeuver do); the pool hedges its marinero and wind side (R25),
 * the hint follows its most likely keys.
 */
export function maneuversFor(game: GameState, content: Content, plan: DayPlan, situation: Situation | null): ManeuverSpec[] {
  const origin = requirePoint(content, game.locationId);
  const destId = plan.legs.reduce((at, l) => otherEnd(requireRoute(content, l.routeId), at) ?? at, game.locationId);
  const dest = requirePoint(content, destId);
  const kinds: Array<[ManeuverKind, boolean]> = [[departureKind(game, origin), false]];
  if (dest.kind === 'bay') kinds.push(['anchoring', false]);
  else {
    kinds.push(['mooring', false]);
    if (dest.placesGoneHour !== null) kinds.push(['anchoring', true]);
  }
  const ctx = situationCondContext(game, content, situation);
  return kinds.flatMap(([kind, fallback]) => {
    const maneuver = maneuverFor(content, kind, berthForKind(kind, situation?.berth));
    if (!maneuver) return [];
    return [{ kind, maneuver, fallback, steps: forecastStepPool(maneuver, game, content, situation, dest).map((x) => x.id), hint: situationHint(maneuver, ctx, game.voices.order) }];
  });
}

/** Tiny deterministic PRNG (mulberry32) for UI shuffles; the engine RNG stays untouched. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `ids` shuffled, never left in the given order. */
export function shuffledStepIds(ids: readonly string[], seed: number): string[] {
  const rnd = prng(seed);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  const unchanged = out.every((id, i) => id === ids[i]);
  return unchanged && out.length > 1 ? [...out.slice(1), out[0]!] : out;
}
