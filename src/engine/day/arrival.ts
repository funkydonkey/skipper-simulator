import { canAfford } from '../budget';
import { EngineError } from '../errors';
import { buildConditionContext } from '../expr';
import { appendLog } from '../log';
import { correctOrder, evaluateManeuver, maneuverForKind } from '../maneuver';
import { priceFor } from '../perks';
import { applyOutcome, applyOutcomes } from '../resources';
import { advanceClock, requireBoat, requirePoint } from '../state';
import { addWear, brokenSystems } from '../systems';
import { anchoring, marinaArrival } from '../time';
import type { Balance, Boat, Content, DayPlan, GameState, Maneuver, ManeuverKind } from '../types';
import { cautionTimeFactor } from '../voices';
import { grantXp } from '../xp';

export interface ArrivalResult { state: GameState; mooring: 'anchor' | 'berth' }
type Orders = DayPlan['maneuverOrders'];

function grantManeuverXp(state: GameState, m: Maneuver, errors: readonly string[], b: Balance): GameState {
  if (errors.length === 0) {
    const done = state.log.some((e) => e.day === state.day && e.cause.startsWith('xp:order:order:ok:'));
    return done ? state : grantXp(state, { order: b.voices.cleanManeuverXp }, `order:ok:${m.id}`, b);
  }
  return errors.reduce((acc, id) => {
    const err = m.errors.find((x) => x.id === id);
    return grantXp(acc, { order: err?.xp ?? b.voices.maneuverErrorXp }, `order:wrong:${m.id}:${id}`, b);
  }, state);
}

export function runManeuver(state: GameState, content: Content, kind: ManeuverKind, orders?: Orders): GameState {
  const m = maneuverForKind(content, kind);
  if (!m) return state;
  const b = content.balance;
  const boat = requireBoat(content, state);
  const r = evaluateManeuver(state.rng, m, orders?.[kind] ?? correctOrder(m), buildConditionContext(state, content), b);
  const wrong = r.value.errors.length > 0;
  let s = appendLog({ ...state, rng: r.next }, { kind: 'decision', cause: `order:${wrong ? 'wrong' : 'ok'}:${m.id}`, pillar: 'safety' });
  s = r.value.rolls.reduce((acc, roll) => appendLog(acc, { kind: 'roll', cause: roll.cause, pillar: 'safety', odds: roll.odds, data: { hit: roll.hit } }), s);
  s = applyOutcomes(s, boat, r.value.outcomes, b);
  s = grantManeuverXp(s, m, r.value.errors, b);
  if (kind === 'anchoring' || kind === 'anchor_up') {
    for (const def of brokenSystems(s, content)) {
      if (def.brokenEffect.anchorEffect) s = applyOutcome(s, boat, { cause: `system:anchor:${def.id}`, pillar: 'boat', effect: def.brokenEffect.anchorEffect }, b);
    }
  }
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
  s = addWear(runManeuver(s, content, 'anchoring', orders), content, 'anchoring', 1);
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
  const fee = point.priceEur > 0 ? priceFor(point.priceEur, arrived.voices.economist, b) : null;
  if (fee && !canAfford(arrived, fee.eur)) {
    const broke = applyOutcome(arrived, boat, { cause: 'marina:no_money', pillar: 'boat', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(broke, content, boat, orders);
  }
  const m = marinaArrival(arrived.rng, { arrivalHour: arrived.clockMin / 60, placesGoneHour: point.placesGoneHour }, buildConditionContext(arrived, content), b);
  const rolled = appendLog({ ...arrived, rng: m.next }, { kind: 'roll', cause: `roll:marina:${point.id}`, pillar: 'time', odds: m.value.odds, data: { hit: m.value.refused } });
  let s = advanceClock(rolled, m.value.waitMin);
  if (m.value.refused) {
    s = applyOutcome(s, boat, { cause: 'marina:refused', pillar: 'time', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(s, content, boat, orders);
  }
  s = advanceClock(s, b.time.marinaMooringMin * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'mooring', orders);
  if (fee) {
    s = applyOutcome(s, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -fee.eur }, saved: fee.savedEur });
  }
  return { state: s, mooring: 'berth' };
}
