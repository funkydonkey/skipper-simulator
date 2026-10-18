import { EngineError } from '../errors';
import { appendLog } from '../log';
import { applyOutcome } from '../resources';
import { chance } from '../rng';
import { bearingDeg, dirToDeg, planLeg, type LegResult } from '../sailing';
import { advanceClock, otherEnd, requirePoint, requireRoute, requireTemplate, round1 } from '../state';
import type { Boat, Content, GameState, LegPlan } from '../types';
import { maneuverRiskFactor } from '../voices';
import { realWind } from '../weather';

export interface LegRun { state: GameState; to: string; motorHours: number; sailHours: number }

export function avgSeasickness(state: GameState, content: Content): number {
  if (state.crew.length === 0) return 0;
  const total = state.crew.reduce((sum, m) => sum + (content.crew.find((a) => a.id === m.archetypeId)?.seasickness ?? 0), 0);
  return total / state.crew.length;
}

export function startEngine(state: GameState, content: Content, boat: Boat): GameState {
  const b = content.balance;
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

function sailRisks(state: GameState, content: Content, boat: Boat, res: LegResult): { state: GameState; extraMin: number } {
  const b = content.balance;
  const risk = maneuverRiskFactor(state.voices, b);
  let s = state;
  if (res.overpowered) {
    const mood = -round1(b.mood.overpowerPerHour * res.hours * (1 + avgSeasickness(s, content)));
    s = applyOutcome(s, boat, { cause: 'sail:overpowered', pillar: 'weather', effect: { mood } });
  }
  const brk = chance(s.rng, res.breakChance * risk);
  s = { ...s, rng: brk.next };
  if (brk.value) s = applyOutcome(s, boat, { cause: 'sail:break', pillar: 'weather', effect: { damage: 'sail_torn' } });
  if (!res.forcedReef) return { state: s, extraMin: 0 };
  const mitigation = s.flags['briefing.loaded_lines'] ? b.safety.mitigationFactor : 1;
  const inj = chance(s.rng, b.sails.reefUnderwayInjuryChance * risk * mitigation);
  s = applyOutcome({ ...s, rng: inj.next }, boat, { cause: 'sail:reef_underway', pillar: 'safety', effect: { fatigue: b.fatigue.maneuverError } });
  if (inj.value) s = applyOutcome(s, boat, { cause: 'injury:reef_underway', pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
  return { state: s, extraMin: b.sails.reefUnderwayMin };
}

export function runLeg(state: GameState, content: Content, boat: Boat, leg: LegPlan, from: string): LegRun {
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const wind = realWind(state.weather, route.kLocal, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  let s = state;
  const mode = leg.mode === 'motor' && s.resources.fuelL <= 0 ? 'sail' : leg.mode;
  if (mode !== leg.mode) s = applyOutcome(s, boat, { cause: 'zero:fuel', pillar: 'boat', effect: {} });
  const res = planLeg({
    mode, windKn: wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  s = appendLog(s, { kind: 'info', cause: `leg:${route.id}`, pillar: 'time', data: { mode, windKn: wind.windKn, speedKn: res.speedKn, hours: res.hours, pos: res.pos } });
  if (wind.frontActive && !s.log.some((e) => e.day === state.day && e.cause === 'weather:front')) {
    s = appendLog(s, { kind: 'info', cause: 'weather:front', pillar: 'weather', data: { windKn: wind.windKn } });
  }
  let extraMin = 0;
  if (mode === 'motor') {
    s = applyOutcome(s, boat, { cause: 'consumption:fuel', pillar: 'boat', effect: { fuel: -round1(res.hours * b.fuel.motorLph) } });
    if (s.resources.fuelL <= 0) s = applyOutcome(s, boat, { cause: 'zero:fuel', pillar: 'boat', effect: {} });
  } else {
    const risks = sailRisks(s, content, boat, res);
    s = risks.state;
    extraMin = risks.extraMin;
  }
  return {
    state: advanceClock(s, res.hours * 60 + extraMin),
    to,
    motorHours: mode === 'motor' ? res.hours : 0,
    sailHours: mode === 'sail' ? res.hours : 0,
  };
}
