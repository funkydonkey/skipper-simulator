import { EngineError } from '../errors';
import { buildConditionContext } from '../expr';
import { appendLog } from '../log';
import { correctOrder, evaluateManeuver, maneuverForKind } from '../maneuver';
import { applyOutcome, applyOutcomes } from '../resources';
import { advanceClock, requireBoat, requirePoint } from '../state';
import { anchoring, marinaArrival } from '../time';
import type { Balance, Boat, Content, DayPlan, GameState, ManeuverKind } from '../types';
import { cautionTimeFactor } from '../voices';

export interface ArrivalResult { state: GameState; mooring: 'anchor' | 'berth' }
type Orders = DayPlan['maneuverOrders'];

export function runManeuver(state: GameState, content: Content, kind: ManeuverKind, orders?: Orders): GameState {
  const m = maneuverForKind(content, kind);
  if (!m) return state;
  const b = content.balance;
  const boat = requireBoat(content, state);
  const r = evaluateManeuver(state.rng, m, orders?.[kind] ?? correctOrder(m), buildConditionContext(state, content), b);
  const wrong = r.value.errors.length > 0;
  let s = appendLog({ ...state, rng: r.next }, { kind: 'decision', cause: `order:${wrong ? 'wrong' : 'ok'}:${m.id}`, pillar: 'safety' });
  s = r.value.rolls.reduce((acc, roll) => appendLog(acc, { kind: 'roll', cause: roll.cause, pillar: 'safety', odds: roll.odds, data: { hit: roll.hit } }), s);
  s = applyOutcomes(s, boat, r.value.outcomes);
  if (wrong) {
    s = applyOutcome(s, boat, { cause: `fatigue:maneuver:${m.id}`, pillar: 'safety', effect: { fatigue: r.value.errors.length * b.fatigue.maneuverError } });
  }
  return s;
}

function anchorHere(state: GameState, content: Content, boat: Boat, orders?: Orders): ArrivalResult {
  const b = content.balance;
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const r = anchoring(state.rng, buildConditionContext(state, content), b);
  let s = r.value.rolls.reduce(
    (acc, roll, i) => appendLog(acc, { kind: 'roll', cause: `roll:anchor:${i + 1}`, pillar: 'time', odds: roll.odds, data: { hit: roll.hit } }),
    { ...state, rng: r.next },
  );
  s = appendLog(s, { kind: 'info', cause: `anchor:attempts:${r.value.attempts}`, pillar: 'time' });
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
  if (point.kind === 'bay') return anchorHere(arrived, content, boat, orders);
  const m = marinaArrival(arrived.rng, { arrivalHour: arrived.clockMin / 60, placesGoneHour: point.placesGoneHour }, buildConditionContext(arrived, content), b);
  const rolled = appendLog({ ...arrived, rng: m.next }, { kind: 'roll', cause: `roll:marina:${point.id}`, pillar: 'time', odds: m.value.odds, data: { hit: m.value.refused } });
  let s = advanceClock(rolled, m.value.waitMin);
  if (m.value.refused) {
    s = applyOutcome(s, boat, { cause: 'marina:refused', pillar: 'time', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(s, content, boat, orders);
  }
  s = advanceClock(s, b.time.marinaMooringMin * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'mooring', orders);
  if (point.priceEur > 0) s = applyOutcome(s, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -point.priceEur } });
  return { state: s, mooring: 'berth' };
}
