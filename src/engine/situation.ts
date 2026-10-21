import { evaluateChance, rollChance } from './chance';
import { EngineError } from './errors';
import { buildConditionContext } from './expr';
import { visibleWeather, previewPlan } from './preview';
import type { RngResult } from './rng';
import { dirToDeg } from './sailing';
import { requirePoint, requireTemplate } from './state';
import type { Balance, BerthType, ChanceSpec, Content, DayPlan, Dir8, GameState, MapPoint, Situation, WindSide } from './types';
import { realWind } from './weather';

type SituationContext = Record<string, string | number | boolean>;

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

/** What the plan promises at the destination. Pure: no RNG. Null on a stay day. */
export function forecastSituation(state: GameState, content: Content, plan: DayPlan): Situation | null {
  if (plan.legs.length === 0 || !state.weather) return null;
  const preview = previewPlan(state, content, plan);
  if (preview.arrivalMin === null) return null;
  const point = requirePoint(content, preview.destinationId);
  const b = content.balance;
  const wind = realWind(visibleWeather(state.weather), 1, preview.arrivalMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const odds = point.marineroChance > 0
    ? evaluateChance(marineroSpec(point, b), { ...buildConditionContext(state, content), hour: preview.arrivalMin / 60 })
    : null;
  return build(point, plan.berth, wind, b, odds !== null && odds.value >= 0.5, odds, 'forecast');
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

/** Condition-language view of a situation; neutral values when there is none. */
export function situationContext(s: Situation | null): SituationContext {
  return {
    'wind.side': s?.windSide ?? 'none',
    'wind.kn': s?.windKn ?? 0,
    'wind.dir': s?.windDir ?? '',
    'place.marinero': s?.marinero ?? false,
    'place.tight': s?.tight ?? false,
    'place.berth': s?.berth ?? '',
  };
}
