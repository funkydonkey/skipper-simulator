import { correctOrder, maneuverFor, otherEnd, requirePoint, requireRoute, type Content, type DayPlan, type GameState, type Maneuver, type ManeuverKind } from '../../../engine';

export interface ManeuverSpec { kind: ManeuverKind; maneuver: Maneuver; fallback: boolean }

/** The maneuvers the engine may run today, in order. Mirrors day/passage.ts and day/arrival.ts. */
export function maneuversFor(game: GameState, content: Content, plan: DayPlan): ManeuverSpec[] {
  const origin = requirePoint(content, game.locationId);
  const destId = plan.legs.reduce((at, l) => otherEnd(requireRoute(content, l.routeId), at) ?? at, game.locationId);
  const dest = requirePoint(content, destId);
  const kinds: Array<[ManeuverKind, boolean]> = [[origin.kind === 'bay' ? 'anchor_up' : 'departure', false]];
  if (dest.kind === 'bay') kinds.push(['anchoring', false]);
  else {
    kinds.push(['mooring', false]);
    if (dest.placesGoneHour !== null) kinds.push(['anchoring', true]);
  }
  return kinds.flatMap(([kind, fallback]) => {
    const maneuver = maneuverFor(content, kind);
    return maneuver ? [{ kind, maneuver, fallback }] : [];
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

export function shuffledStepIds(m: Maneuver, seed: number): string[] {
  const ids = correctOrder(m);
  const rnd = prng(seed);
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  const unchanged = out.every((id, i) => id === ids[i]);
  return unchanged && out.length > 1 ? [...out.slice(1), out[0]!] : out;
}
