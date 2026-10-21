import { evaluateChance, rollChance } from './chance';
import { EngineError } from './errors';
import { buildConditionContext } from './expr';
import type { RngResult } from './rng';
import { dirToDeg } from './sailing';
import { requireTemplate } from './state';
import type { Balance, BerthType, ChanceSpec, Content, DayWeather, Dir8, GameState, MapPoint, Situation, WindSide } from './types';
import { realWind } from './weather';

/** Which side of the moored boat the wind comes from. `windFromDeg` is where it blows FROM; `headingDeg` is the bow heading. */
export function windSide(windFromDeg: number, headingDeg: number, windKn: number, b: Balance): WindSide {
  if (windKn < b.situation.calmKn) return 'none';
  const rel = (((windFromDeg - headingDeg) % 360) + 360) % 360;
  if (rel <= 45 || rel >= 315) return 'bow';
  if (rel < 135) return 'starboard';
  if (rel <= 225) return 'stern';
  return 'port';
}

/** Odds a marinero meets the boat: halved in the evening. */
export function marineroSpec(point: MapPoint, _b: Balance): ChanceSpec {
  return { base: point.marineroChance, mods: [{ if: 'hour >= 18', mul: -0.5, label: 'marinero' }] };
}

function berthOf(point: MapPoint, berth: BerthType | undefined): { type: BerthType; headingDeg: number } {
  const found = berth === undefined ? point.berths[0] : point.berths.find((x) => x.type === berth);
  if (!found) throw new EngineError('INVALID_INPUT', `${point.id} has no ${berth} berth`);
  return found;
}

function build(
  point: MapPoint, berth: BerthType | undefined, wind: { windKn: number; dir: Dir8 }, b: Balance,
  marinero: boolean, marineroOdds: Situation['marineroOdds'], source: Situation['source'],
): Situation {
  const chosen = berthOf(point, berth);
  return {
    berth: chosen.type, windSide: windSide(dirToDeg(wind.dir), chosen.headingDeg, wind.windKn, b),
    windKn: wind.windKn, windDir: wind.dir, marinero, marineroOdds, seabed: point.seabed, tight: point.tight ?? false, source,
  };
}

/**
 * The forecast at `point` on arrival at `arrivalMin`, seen through `weather` (the captain's visible weather).
 * Pure: no RNG. `previewPlan` calls it; `forecastSituation` (preview.ts) wraps it for a plan.
 */
export function forecastAt(
  state: GameState, content: Content, weather: DayWeather, point: MapPoint, berth: BerthType | undefined, arrivalMin: number,
): Situation {
  const b = content.balance;
  const wind = realWind(weather, 1, arrivalMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const odds = point.marineroChance > 0
    ? evaluateChance(marineroSpec(point, b), { ...buildConditionContext(state, content), hour: arrivalMin / 60 })
    : null;
  return build(point, berth, wind, b, odds !== null && odds.value >= 0.5, odds, 'forecast');
}

/**
 * The fact on arrival at `state.clockMin`: real wind, one marinero roll at points that have one.
 * The returned situation keeps the rolled odds so the caller can log `roll:marinero:<pointId>`.
 */
export function arrivalSituation(state: GameState, content: Content, point: MapPoint, berth: BerthType): RngResult<Situation> {
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const b = content.balance;
  const wind = realWind(state.weather, 1, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  if (point.marineroChance <= 0) return { value: build(point, berth, wind, b, false, null, 'fact'), next: state.rng };
  const r = rollChance(state.rng, marineroSpec(point, b), buildConditionContext(state, content));
  return { value: build(point, berth, wind, b, r.value.hit, r.value.odds, 'fact'), next: r.next };
}

export { situationContext, type SituationContext } from './situation-context';
