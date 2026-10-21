import { rollChance } from '../chance';
import { EngineError } from '../errors';
import { buildConditionContext } from '../expr';
import { appendLog } from '../log';
import { injurySpec, sailBreakSpec } from '../odds';
import { applyOutcome } from '../resources';
import { bearingDeg, dirToDeg, planLeg, type LegResult } from '../sailing';
import { advanceClock, otherEnd, requirePoint, requireRoute, requireTemplate, round1 } from '../state';
import type { Balance, Boat, Content, GameState, LegPlan, Route } from '../types';
import { brokenFlags, type BrokenFlags } from '../systems';
import { realWind } from '../weather';

export interface LegRun { state: GameState; to: string; motorHours: number; sailHours: number; windKn: number }

export function avgSeasickness(state: GameState, content: Content): number {
  if (state.crew.length === 0) return 0;
  const total = state.crew.reduce((sum, m) => sum + (content.crew.find((a) => a.id === m.archetypeId)?.seasickness ?? 0), 0);
  return total / state.crew.length;
}

export function startEngine(state: GameState, content: Content, boat: Boat): GameState {
  const b = content.balance;
  if (brokenFlags(state, content).noMotor) return state;
  let s = state;
  if (s.resources.starterBankPct < b.electric.starterMinPct) {
    s = applyOutcome(s, boat, {
      cause: 'zero:starter',
      pillar: 'boat',
      effect: { money: -b.rescue.jumpStartEur, mood: -b.rescue.moodPenalty, starter_bank: b.electric.starterMinPct },
    });
    s = advanceClock(s, b.rescue.jumpStartDelayMin);
  }
  return applyOutcome(s, boat, { cause: 'engine:start', pillar: 'boat', effect: { starter_bank: -b.electric.starterStartPct } });
}

const REEF_MITIGATION_FLAG = 'briefing.loaded_lines';

function sailRisks(state: GameState, content: Content, boat: Boat, route: Route, res: LegResult): { state: GameState; extraMin: number } {
  const b = content.balance;
  const ctx = buildConditionContext(state, content);
  let s = state;
  if (res.overpowered) {
    const mood = -round1(b.mood.overpowerPerHour * res.hours * (1 + avgSeasickness(s, content)));
    s = applyOutcome(s, boat, { cause: 'sail:overpowered', pillar: 'weather', effect: { mood } });
  }
  const brk = rollChance(s.rng, sailBreakSpec(res.breakChance, b), ctx);
  s = appendLog({ ...s, rng: brk.next }, { kind: 'roll', cause: `roll:sail_break:${route.id}`, pillar: 'weather', odds: brk.value.odds, data: { hit: brk.value.hit } });
  if (brk.value.hit) s = applyOutcome(s, boat, { cause: 'sail:break', pillar: 'weather', effect: { damage: 'sail_torn' } });
  if (!res.forcedReef) return { state: s, extraMin: 0 };
  const inj = rollChance(s.rng, injurySpec(b.sails.reefUnderwayInjuryChance, REEF_MITIGATION_FLAG, b), ctx);
  s = appendLog({ ...s, rng: inj.next }, { kind: 'roll', cause: `roll:injury:reef:${route.id}`, pillar: 'safety', odds: inj.value.odds, data: { hit: inj.value.hit } });
  s = applyOutcome(s, boat, { cause: 'sail:reef_underway', pillar: 'safety', effect: { fatigue: b.fatigue.maneuverError } });
  if (inj.value.hit) s = applyOutcome(s, boat, { cause: 'injury:reef_underway', pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
  return { state: s, extraMin: b.sails.reefUnderwayMin };
}

export interface ModePlan { mode: 'motor' | 'sail'; drift: boolean; tow: boolean; causes: string[] }

/**
 * Motor falls back to sail on empty tank or a dead motor, sail to motor on a broken rig; with neither the boat drifts under sail.
 * A boat that must motor (or has neither motor nor sail) in a wind too weak to sail is towed. Shared by `runLeg` and the preview.
 */
export function resolveMode(requested: LegPlan['mode'], fuelL: number, flags: BrokenFlags, routeId: string, windKn: number, b: Balance): ModePlan {
  const motorUsable = !flags.noMotor && fuelL > 0;
  const causes: string[] = [];
  if (requested === 'motor') {
    if (fuelL <= 0) causes.push('zero:fuel');
    if (flags.noMotor) causes.push(`system:no_motor:${routeId}`);
    if (motorUsable) return { mode: 'motor', drift: false, tow: false, causes };
    if (flags.noSail) causes.push(`system:no_sail:${routeId}`);
    return { mode: 'sail', drift: flags.noSail, tow: flags.noSail || windKn < b.sails.minSailWindKn, causes };
  }
  if (flags.noSail) causes.push(`system:no_sail:${routeId}`);
  if (!flags.noSail) return { mode: 'sail', drift: false, tow: false, causes };
  if (flags.noMotor) causes.push(`system:no_motor:${routeId}`);
  return { mode: motorUsable ? 'motor' : 'sail', drift: !motorUsable, tow: !motorUsable, causes };
}

export function runLeg(state: GameState, content: Content, boat: Boat, leg: LegPlan, from: string): LegRun {
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const wind = realWind(state.weather, route.kLocal, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  let s = state;
  const { mode, drift, tow, causes } = resolveMode(leg.mode, s.resources.fuelL, brokenFlags(s, content), route.id, wind.windKn, b);
  for (const cause of causes) {
    s = cause === 'zero:fuel' ? applyOutcome(s, boat, { cause, pillar: 'boat', effect: {} }) : appendLog(s, { kind: 'info', cause, pillar: 'boat' });
  }
  const res = planLeg({
    mode, windKn: drift ? 0 : wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  s = appendLog(s, { kind: 'info', cause: `leg:${route.id}`, pillar: 'time', data: { mode, windKn: wind.windKn, speedKn: res.speedKn, hours: tow ? b.rescue.towHours : res.hours, pos: res.pos } });
  if (wind.frontActive && !s.log.some((e) => e.day === state.day && e.cause === 'weather:front')) {
    s = appendLog(s, { kind: 'info', cause: 'weather:front', pillar: 'weather', data: { windKn: wind.windKn } });
  }
  if (tow) {
    const effect = { money: -b.rescue.towEur, time_hours: b.rescue.towHours, mood: -b.rescue.towMoodPenalty };
    s = applyOutcome(s, boat, { cause: `rescue:tow:${route.id}`, pillar: 'boat', effect });
    return { state: s, to, motorHours: 0, sailHours: 0, windKn: wind.windKn };
  }
  let extraMin = 0;
  if (mode === 'motor') {
    s = applyOutcome(s, boat, { cause: 'consumption:fuel', pillar: 'boat', effect: { fuel: -round1(res.hours * b.fuel.motorLph) } });
    if (s.resources.fuelL <= 0) s = applyOutcome(s, boat, { cause: 'zero:fuel', pillar: 'boat', effect: {} });
  } else {
    const risks = sailRisks(s, content, boat, route, res);
    s = risks.state;
    extraMin = risks.extraMin;
  }
  return {
    state: advanceClock(s, res.hours * 60 + extraMin),
    to,
    motorHours: mode === 'motor' ? res.hours : 0,
    sailHours: mode === 'sail' ? res.hours : 0,
    windKn: wind.windKn,
  };
}
