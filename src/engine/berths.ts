import type { MapPoint } from './types';

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
