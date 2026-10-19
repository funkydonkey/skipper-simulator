import { assertNoPendingEvent, assertPhase, EngineError } from '../errors';
import { appendLog } from '../log';
import { crewSensitivity, resolveDueExpectations, sayDialogue } from '../promises';
import { applyOutcome, applyOutcomes, dailyConsumption, refillAt, zeroResourceOutcomes } from '../resources';
import { clamp, requireBoat, requirePoint, round1 } from '../state';
import type { Activity, Balance, Boat, Content, DayFacts, GameState, MapPoint, Outcome } from '../types';
import { restHours } from '../time';
import { exposure } from '../weather';

export interface EveningChoice { dinner: 'cook' | 'taverna'; dialogueId?: string | null }

export const tavernaOpen = (clockMin: number, b: Balance): boolean => clockMin < b.time.tavernaCloseHour * 60;

function dinner(state: GameState, b: Balance, choice: EveningChoice['dinner']): { outcomes: Outcome[]; cooked: boolean; activity: Activity | null } {
  if (choice === 'taverna') {
    const effect = { money: -state.crew.length * b.mood.tavernaEurPerPerson, mood: b.mood.tavernaDinner };
    return { outcomes: [{ cause: 'activity:taverna', pillar: 'promises', effect }], cooked: false, activity: 'taverna' };
  }
  if (state.resources.gasPct < b.gas.pctPerDay) {
    return { outcomes: [{ cause: 'zero:gas', pillar: 'boat', effect: { mood: -b.gas.noHotFoodMoodPenalty } }], cooked: false, activity: null };
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
  }, b));
  s = applyOutcomes(s, boat, zeroResourceOutcomes(s, b));
  if (s.moodPerDay !== 0) s = applyOutcome(s, boat, { cause: 'mood_per_day', pillar: 'boat', effect: { mood: s.moodPerDay } });
  if (atBerth) s = { ...s, moodPerDay: 0 };
  const w = s.weather;
  const dir = w ? (w.front ? w.frontDir : w.forecastDir) : null;
  if (facts.mooring === 'anchor' && dir && exposure(point, dir) > b.fatigue.rollyExposure) {
    s = applyOutcome(s, boat, { cause: 'night:rolly', pillar: 'weather', effect: { mood: -b.mood.rollyNight, fatigue: b.fatigue.rollyNightPenalty } });
  }
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
  const meal = dinner(state, b, choice.dinner);
  let s = applyOutcomes(checkReturn(rest(state, boat, b), point, b), boat, meal.outcomes);
  const dayFacts = meal.activity ? { ...facts, activities: [...facts.activities, meal.activity] } : facts;
  const resolved = resolveDueExpectations(s.expectations, dayFacts, s.voices.diplomat, crewSensitivity(s, content), b);
  s = applyOutcomes({ ...s, expectations: resolved.expectations }, boat, resolved.outcomes);
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'evening');
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
  for (const d of boat.hiddenDefects) {
    if (d.chargedOnReturn && s.flags[`defect.${d.id}`]) {
      s = applyOutcome(s, boat, { cause: `deposit:unrecorded:${d.id}`, pillar: 'boat', effect: { damage: d.chargedOnReturn } });
    }
  }
  return { ...s, phase: 'debrief' };
}
