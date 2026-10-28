import { berthFee, stayFee } from '../berths';
import { canAfford } from '../budget';
import { EngineError } from '../errors';
import { buildConditionContext } from '../expr';
import { appendLog } from '../log';
import { correctOrder, evaluateManeuver, maneuverFor } from '../maneuver';
import { applyOutcome, applyOutcomes } from '../resources';
import { arrivalSituation } from '../situation';
import { advanceClock, requireBoat, requirePoint } from '../state';
import { addWear, brokenSystems } from '../systems';
import { anchoring, marinaArrival } from '../time';
import type { Balance, BerthType, Boat, Content, DayPlan, GameState, Maneuver, ManeuverKind, MapPoint } from '../types';
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

/** The maneuver follows `state.situation`: its berth picks the maneuver, its keys the steps. No order = correct (R11). */
export function runManeuver(state: GameState, content: Content, kind: ManeuverKind, orders?: Orders): GameState {
  const m = maneuverFor(content, kind, state.situation?.berth);
  if (!m) return state;
  const b = content.balance;
  const boat = requireBoat(content, state);
  const ctx = buildConditionContext(state, content);
  const r = evaluateManeuver(state.rng, m, orders?.[kind] ?? correctOrder(m, ctx), ctx, b);
  const wrong = r.value.errors.length > 0;
  // Steps an error found too late; the rest were done in time (`step.<id>` in conditions).
  const late = [...new Set(r.value.errors.flatMap((id) => m.errors.find((e) => e.id === id)?.wrongIf.then ?? []))];
  let s = appendLog(
    { ...state, rng: r.next },
    { kind: 'decision', cause: `order:${wrong ? 'wrong' : 'ok'}:${m.id}`, pillar: 'safety', data: { steps: r.value.steps, late } },
  );
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

/** Sets `state.situation` for `berth`; logs the marinero roll when the point has one (R15). */
function settleSituation(state: GameState, content: Content, point: MapPoint, berth: BerthType): GameState {
  const r = arrivalSituation(state, content, point, berth);
  const s: GameState = { ...state, rng: r.next, situation: r.value };
  const odds = r.value.marineroOdds;
  if (point.marineroChance <= 0 || !odds) return s;
  return appendLog(s, { kind: 'roll', cause: `roll:marinero:${point.id}`, pillar: 'safety', odds, data: { hit: r.value.marinero } });
}

/** Anchoring off a marina or quay the boat could not berth at: no marinero, not tight; a bay keeps its own berth. */
function anchorOutside(point: MapPoint): MapPoint {
  return { ...point, berths: [{ type: 'anchor', headingDeg: 0 }], marineroChance: 0, tight: false };
}

function anchorHere(state: GameState, content: Content, boat: Boat, point: MapPoint, berth: BerthType, orders?: Orders): ArrivalResult {
  const b = content.balance;
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const placed = settleSituation(state, content, point.kind === 'bay' ? point : anchorOutside(point), berth);
  const r = anchoring(placed.rng, buildConditionContext(placed, content), b);
  let s = r.value.rolls.reduce(
    (acc, roll, i) => appendLog(acc, { kind: 'roll', cause: `roll:anchor:${i + 1}`, pillar: 'time', odds: roll.odds, data: { hit: roll.hit } }),
    { ...placed, rng: r.next },
  );
  s = appendLog(s, { kind: 'info', cause: `anchor:attempts:${r.value.attempts}`, pillar: 'time' });
  s = advanceClock(s, r.value.minutes * cautionTimeFactor(s.voices.caution, b));
  s = addWear(runManeuver({ ...s, lastBerth: null }, content, 'anchoring', orders), content, 'anchoring', 1);
  if (berth === 'anchor_ashore') s = applyOutcome(s, boat, { cause: 'anchor:ashore', pillar: 'time', effect: { time_hours: b.berths.ashoreTimeHours } });
  if (!r.value.held) s = applyOutcome(s, boat, { cause: 'anchor:dragging', pillar: 'time', effect: { fatigue: b.fatigue.rollyNightPenalty } });
  return { state: s, mooring: 'anchor' };
}

function nightArrival(state: GameState, boat: Boat, b: Balance): GameState {
  if (state.clockMin < b.time.sunsetHour * 60) return state;
  return applyOutcome(state, boat, { cause: 'night:arrival', pillar: 'time', effect: { fatigue: b.fatigue.nightArrival, mood: -b.mood.nightArrival } });
}

/**
 * Another night where the boat already lies. A paid berth charges again for the berth it arrived at; short of money,
 * the boat leaves it and lies at anchor off. A night anchored off stays one.
 */
export function stayHere(state: GameState, content: Content, boat: Boat): ArrivalResult {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  if (point.kind === 'bay' || state.anchoredOff) return { state, mooring: 'anchor' };
  const fee = stayFee(state, point, b);
  if (!fee) return { state, mooring: 'berth' };
  if (!canAfford(state, fee.eur)) {
    return { state: applyOutcome({ ...state, lastBerth: null }, boat, { cause: 'marina:no_money', pillar: 'boat', effect: { mood: -b.mood.marinaRefused } }), mooring: 'anchor' };
  }
  return { state: applyOutcome(state, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -fee.eur }, saved: fee.savedEur }), mooring: 'berth' };
}

/** `berth` is the plan's berth (validated by validatePlan); the point's first berth when absent. */
export function arrive(state: GameState, content: Content, boat: Boat, orders?: Orders, plannedBerth?: BerthType): ArrivalResult {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  const berth = plannedBerth ?? point.berths[0]!.type;
  const arrived = nightArrival(state, boat, b);
  if (point.kind === 'bay') return anchorHere(arrived, content, boat, point, berth, orders);
  const fee = berthFee(point, berth, arrived.voices.economist, b);
  if (fee && !canAfford(arrived, fee.eur)) {
    const broke = applyOutcome(arrived, boat, { cause: 'marina:no_money', pillar: 'boat', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(broke, content, boat, point, 'anchor', orders);
  }
  const m = marinaArrival(arrived.rng, { arrivalHour: arrived.clockMin / 60, placesGoneHour: point.placesGoneHour }, buildConditionContext(arrived, content), b);
  const rolled = appendLog({ ...arrived, rng: m.next }, { kind: 'roll', cause: `roll:marina:${point.id}`, pillar: 'time', odds: m.value.odds, data: { hit: m.value.refused } });
  let s = advanceClock(rolled, m.value.waitMin);
  if (m.value.refused) {
    s = applyOutcome(s, boat, { cause: 'marina:refused', pillar: 'time', effect: { mood: -b.mood.marinaRefused } });
    return anchorHere(s, content, boat, point, 'anchor', orders);
  }
  s = settleSituation({ ...s, lastBerth: berth }, content, point, berth);
  s = advanceClock(s, b.time.marinaMooringMin * cautionTimeFactor(s.voices.caution, b));
  s = runManeuver(s, content, 'mooring', orders);
  if (fee) {
    s = applyOutcome(s, boat, { cause: 'marina:fee', pillar: 'boat', effect: { money: -fee.eur }, saved: fee.savedEur });
  }
  return { state: s, mooring: 'berth' };
}
