import { EngineError } from '../errors';
import { appendLog } from '../log';
import { correctOrder, evaluateManeuver, maneuverForKind } from '../maneuver';
import { applyOutcome, applyOutcomes } from '../resources';
import { advanceClock, requireBoat, requirePoint, requireTemplate } from '../state';
import { anchoring, marinaArrival } from '../time';
import type { Balance, Boat, Content, DayPlan, GameState, ManeuverKind, MapPoint } from '../types';
import { cautionTimeFactor, maneuverRiskFactor } from '../voices';
import { realWind } from '../weather';

export interface ArrivalResult { state: GameState; mooring: 'anchor' | 'berth' }
type Orders = DayPlan['maneuverOrders'];

export function runManeuver(state: GameState, content: Content, kind: ManeuverKind, orders?: Orders): GameState {
  const m = maneuverForKind(content, kind);
  if (!m) return state;
  const b = content.balance;
  const boat = requireBoat(content, state);
  const r = evaluateManeuver(state.rng, m, orders?.[kind] ?? correctOrder(m), state.flags, maneuverRiskFactor(state.voices, b), b);
  const wrong = r.value.errors.length > 0;
  let s = appendLog({ ...state, rng: r.next }, { kind: 'decision', cause: `order:${wrong ? 'wrong' : 'ok'}:${m.id}`, pillar: 'safety' });
  s = applyOutcomes(s, boat, r.value.outcomes);
  if (wrong) {
    s = applyOutcome(s, boat, { cause: `fatigue:maneuver:${m.id}`, pillar: 'safety', effect: { fatigue: r.value.errors.length * b.fatigue.maneuverError } });
  }
  return s;
}

function anchorHere(state: GameState, content: Content, boat: Boat, point: MapPoint, orders?: Orders): ArrivalResult {
  const b = content.balance;
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const wind = realWind(state.weather, 1, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const night = state.clockMin >= b.time.sunsetHour * 60;
  const r = anchoring(state.rng, { seabed: point.seabed, windKn: wind.windKn, briefed: state.flags['briefing.anchor'] === true, night }, b);
  let s = appendLog({ ...state, rng: r.next }, { kind: 'info', cause: `anchor:attempts:${r.value.attempts}`, pillar: 'time' });
  s = advanceClock(s, r.value.minutes * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'anchoring', orders);
  if (!r.value.held) s = applyOutcome(s, boat, { cause: 'anchor:dragging', pillar: 'time', effect: { fatigue: b.fatigue.rollyNightPenalty } });
  return { state: s, mooring: 'anchor' };
}

function nightArrival(state: GameState, boat: Boat, b: Balance): GameState {
  if (state.clockMin < b.time.sunsetHour * 60) return state;
  return applyOutcome(state, boat, { cause: 'night:arrival', pillar: 'time', effect: { fatigue: b.fatigue.nightArrival, mood: -b.mood.nightArrival } });
}

export function arrive(state: GameState, content: Content, boat: Boat, orders?: Orders): ArrivalResult {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  const arrived = nightArrival(state, boat, b);
  if (point.kind === 'bay') return anchorHere(arrived, content, boat, point, orders);
  const m = marinaArrival(arrived.rng, { arrivalHour: arrived.clockMin / 60, placesGoneHour: point.placesGoneHour }, b);
  let s = advanceClock({ ...arrived, rng: m.next }, m.value.waitMin);
  if (m.value.refused) {
    s = applyOutcome(s, boat, { cause: 'marina:refused', pillar: 'time', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(s, content, boat, point, orders);
  }
  s = advanceClock(s, b.time.marinaMooringMin * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'mooring', orders);
  if (point.priceEur > 0) s = applyOutcome(s, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -point.priceEur } });
  return { state: s, mooring: 'berth' };
}
