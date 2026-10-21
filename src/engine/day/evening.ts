import { canAfford } from '../budget';
import { assertNoPendingEvent, assertPhase, EngineError } from '../errors';
import { appendLog } from '../log';
import { priceFor } from '../perks';
import { crewSensitivity, resolveDueExpectations, sayDialogue } from '../promises';
import { applyOutcome, applyOutcomes, dailyConsumption, refillAt, zeroResourceOutcomes } from '../resources';
import { clamp, requireBoat, requirePoint, round1 } from '../state';
import { addWear, brokenFlags, brokenSystems } from '../systems';
import type { Activity, Balance, Boat, Content, DayFacts, GameState, MapPoint, Outcome } from '../types';
import { restHours } from '../time';
import { exposure } from '../weather';
import { applyLevelUps } from '../xp';

export interface EveningChoice { dinner: 'cook' | 'taverna'; dialogueId?: string | null }

export const tavernaOpen = (clockMin: number, b: Balance): boolean => clockMin < b.time.tavernaCloseHour * 60;

/** What the crew's taverna dinner costs this evening, after the economist's discount. */
export const tavernaBill = (state: GameState, b: Balance): { eur: number; savedEur: number } =>
  priceFor(state.crew.length * b.mood.tavernaEurPerPerson, state.voices.economist, b);

function dinner(state: GameState, content: Content, choice: EveningChoice['dinner']): { outcomes: Outcome[]; cooked: boolean; activity: Activity | null } {
  const b = content.balance;
  if (choice === 'taverna') {
    const bill = tavernaBill(state, b);
    if (!canAfford(state, bill.eur)) throw new EngineError('NO_MONEY', `Dinner costs ${bill.eur} EUR`);
    const effect = { money: -bill.eur, mood: b.mood.tavernaDinner };
    return { outcomes: [{ cause: 'activity:taverna', pillar: 'promises', effect, saved: bill.savedEur }], cooked: false, activity: 'taverna' };
  }
  const noCook = brokenFlags(state, content).noCook;
  if (noCook || state.resources.gasPct < b.gas.pctPerDay) {
    const zero: Outcome = { cause: 'zero:gas', pillar: 'boat', effect: { mood: -b.gas.noHotFoodMoodPenalty } };
    const broken: Outcome[] = noCook ? [{ cause: 'system:no_cook', pillar: 'boat', effect: {} }] : [];
    return { outcomes: [zero, ...broken], cooked: false, activity: null };
  }
  return { outcomes: [], cooked: true, activity: null };
}

function night(state: GameState, content: Content, boat: Boat, point: MapPoint, facts: DayFacts, cooked: boolean): GameState {
  const b = content.balance;
  const atBerth = facts.mooring === 'berth';
  let s = atBerth ? applyOutcomes(state, boat, refillAt(state, boat, point, b)) : state;
  s = applyOutcomes(s, boat, dailyConsumption({
    crewSize: s.crew.length, shower: facts.shower, boat,
    motorHours: facts.motorHours, sailHours: facts.sailHours, autopilotHours: facts.autopilotHours,
    shorePower: atBerth && point.services.shorePower, cookedDinner: cooked,
    noCharge: brokenFlags(s, content).noCharge,
  }, b));
  s = applyOutcomes(s, boat, zeroResourceOutcomes(s, b));
  if (s.moodPerDay !== 0) s = applyOutcome(s, boat, { cause: 'mood_per_day', pillar: 'boat', effect: { mood: s.moodPerDay } });
  if (atBerth) s = { ...s, moodPerDay: 0 };
  for (const def of brokenSystems(s, content)) {
    if (def.brokenEffect.dailyEffect) s = applyOutcome(s, boat, { cause: `system:daily:${def.id}`, pillar: 'boat', effect: def.brokenEffect.dailyEffect }, b);
  }
  const w = s.weather;
  const dir = w ? (w.front ? w.frontDir : w.forecastDir) : null;
  if (facts.mooring === 'anchor' && dir && exposure(point, dir) > b.fatigue.rollyExposure) {
    s = applyOutcome(s, boat, { cause: 'night:rolly', pillar: 'weather', effect: { mood: -b.mood.rollyNight, fatigue: b.fatigue.rollyNightPenalty } });
  }
  s = addWear(s, content, 'night', 1);
  return applyOutcome(s, boat, { cause: 'night:sleep', pillar: 'time', effect: { fatigue: -round1(b.fatigue.nightRecovery * sleepShare(s.clockMin, b)) } });
}

const HOURS_PER_DAY = 24;

/** Share of a full night's sleep left between bedtime and the next morning; full when in before sunset. */
export function sleepShare(clockMin: number, b: Balance): number {
  const morning = HOURS_PER_DAY + b.start.hour;
  return clamp((morning - clockMin / 60) / (morning - b.time.sunsetHour), 0, 1);
}

/** Rest and the return deadline use the clock after all of today's events were resolved. */
function rest(state: GameState, boat: Boat, b: Balance): GameState {
  return applyOutcome(state, boat, { cause: 'rest', pillar: 'time', effect: { mood: round1(restHours(state.clockMin, b) * b.mood.restPerHour) } });
}

function checkReturn(state: GameState, point: MapPoint, b: Balance): GameState {
  if (state.day !== b.schedule.days) return state;
  const onTime = point.kind === 'base' && state.clockMin <= b.schedule.returnDeadlineHour * 60;
  return appendLog({ ...state, returnedOnTime: onTime }, { kind: 'info', cause: `return:${onTime ? 'on_time' : 'late'}`, pillar: 'time' });
}

export function endDay(state: GameState, content: Content, choice: EveningChoice): GameState {
  assertPhase(state, 'evening');
  assertNoPendingEvent(state);
  const facts = state.dayFacts;
  if (!facts) throw new EngineError('WRONG_PHASE', 'No day facts: call planDay first');
  const b = content.balance;
  const boat = requireBoat(content, state);
  const point = requirePoint(content, state.locationId);
  if (choice.dinner === 'taverna' && !point.services.taverna) throw new EngineError('INVALID_INPUT', `No taverna at ${point.id}`);
  if (choice.dinner === 'taverna' && !tavernaOpen(state.clockMin, b)) throw new EngineError('INVALID_INPUT', 'Taverna is closed');
  const meal = dinner(state, content, choice.dinner);
  let s = applyOutcomes(checkReturn(rest(state, boat, b), point, b), boat, meal.outcomes);
  const dayFacts = meal.activity ? { ...facts, activities: [...facts.activities, meal.activity] } : facts;
  const resolved = resolveDueExpectations(s.expectations, dayFacts, s.voices.diplomat, crewSensitivity(s, content), b);
  s = applyOutcomes({ ...s, expectations: resolved.expectations }, boat, resolved.outcomes);
  for (const { mood } of resolved.softened) s = appendLog(s, { kind: 'info', cause: 'voice:diplomat:softened', pillar: 'promises', data: { mood } });
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'evening');
  s = applyLevelUps(s, b);
  s = night(s, content, boat, point, facts, meal.cooked);
  const day = s.day + 1;
  return { ...s, day, phase: day > b.schedule.days ? 'return' : 'morning', clockMin: b.start.hour * 60, weather: null, dayFacts: null };
}

export function finishWeek(state: GameState, content: Content): GameState {
  assertPhase(state, 'return');
  const b = content.balance;
  const boat = requireBoat(content, state);
  let s = state;
  if (s.returnedOnTime !== true) s = applyOutcome(s, boat, { cause: 'return:late_fee', pillar: 'time', effect: { money: -b.schedule.lateFeeEur } });
  for (const d of boat.defectPool) {
    if (d.chargedOnReturn && s.defects.includes(d.id) && s.flags[`defect.${d.id}`]) {
      s = applyOutcome(s, boat, { cause: `deposit:unrecorded:${d.id}`, pillar: 'boat', effect: { damage: d.chargedOnReturn } });
    }
  }
  return { ...s, phase: 'debrief' };
}
