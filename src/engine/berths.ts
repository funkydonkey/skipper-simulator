import { priceFor } from './perks';
import type { Balance, BerthType, GameState, ManeuverKind, MapPoint } from './types';

/** The kind a berth's maneuver belongs to. */
export const BERTH_KIND: Readonly<Record<BerthType, ManeuverKind>> = { stern_to: 'mooring', side_to: 'mooring', anchor: 'anchoring', anchor_ashore: 'anchoring' };

/** The berth that picks the maneuver of `kind`: the berth's own kind gets it; other kinds (departure, fallback anchoring) their default. */
export function berthForKind(kind: ManeuverKind, berth: BerthType | undefined): BerthType | undefined {
  return berth !== undefined && BERTH_KIND[berth] === kind ? berth : undefined;
}

const ANCHOR_BERTHS = ['anchor', 'anchor_ashore'];
const DOCK_BERTHS = ['stern_to', 'side_to'];

/** Why a point's berths contradict its kind, or null. Bays anchor; base, marina and quay dock. */
export function pointBerthProblem(p: Pick<MapPoint, 'id' | 'kind' | 'berths' | 'marineroChance'>): string | null {
  const allowed = p.kind === 'bay' ? ANCHOR_BERTHS : DOCK_BERTHS;
  const bad = p.berths.find((b) => !allowed.includes(b.type));
  if (bad) return `${p.kind} "${p.id}" cannot have a ${bad.type} berth`;
  if (p.kind === 'bay' && p.marineroChance !== 0) return `bay "${p.id}" must have marineroChance 0`;
  return null;
}

/** The berth fee: side-to costs `balance.berths.sideToPriceFactor` times the listed price. Null at a free point. */
export function berthFee(point: MapPoint, berth: BerthType, economistLevel: number, b: Balance): { eur: number; savedEur: number } | null {
  if (point.priceEur <= 0) return null;
  const factor = berth === 'side_to' ? b.berths.sideToPriceFactor : 1;
  return priceFor(point.priceEur * factor, economistLevel, b);
}

/** Another night where the boat lies: the fee for the berth it arrived at (the point's default when unknown); null when free or at anchor. */
export function stayFee(state: Pick<GameState, 'anchoredOff' | 'lastBerth' | 'voices'>, point: MapPoint, b: Balance): { eur: number; savedEur: number } | null {
  if (point.kind === 'bay' || state.anchoredOff) return null;
  const berth = point.berths.find((x) => x.type === state.lastBerth)?.type ?? point.berths[0]!.type;
  return berthFee(point, berth, state.voices.economist, b);
}
