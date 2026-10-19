import { assertNoPendingEvent, assertPhase, EngineError } from '../errors';
import { queueEvent } from '../events';
import { appendLog } from '../log';
import { maneuverForKind, validateOrder } from '../maneuver';
import { applyOutcome } from '../resources';
import { advanceClock, otherEnd, requireBoat, requirePoint, requireRoute, round1, round2 } from '../state';
import { restHours } from '../time';
import { MANEUVER_KINDS, type Activity, type Balance, type Boat, type Content, type DayPlan, type EventPhase, type GameState, type ManeuverKind } from '../types';
import { arrive, runManeuver } from './arrival';
import { runLeg, startEngine } from './legs';

const SHOWERS = ['strict', 'normal', 'loose'];
const MODES = ['motor', 'sail'];
const GENOAS = ['full', 'partial'];
const COURSES = ['direct', 'detour'];
const REEFS = [0, 1, 2];

interface DaySummary { moving: boolean; departureHour: number | null; mooring: 'anchor' | 'berth'; motor: number; sail: number; legHours: number; swum: number }

function invalid(msg: string): never {
  throw new EngineError('INVALID_INPUT', msg);
}

function validateOrders(content: Content, plan: DayPlan): void {
  for (const [kind, order] of Object.entries(plan.maneuverOrders ?? {}) as [ManeuverKind, string[]][]) {
    if (!(MANEUVER_KINDS as readonly string[]).includes(kind)) invalid(`Unknown maneuver kind "${kind}"`);
    const m = maneuverForKind(content, kind);
    const problem = m ? validateOrder(m, order) : null;
    if (problem) invalid(problem);
  }
}

export function validatePlan(state: GameState, content: Content, plan: DayPlan): void {
  const t = content.balance.time;
  if (!Number.isFinite(plan.departureHour) || plan.departureHour < t.earliestDepartureHour || plan.departureHour >= t.sunsetHour) {
    invalid(`departureHour must be within ${t.earliestDepartureHour}..${t.sunsetHour} (before sunset)`);
  }
  if (plan.legs.length > 0 && Math.max(plan.departureHour, state.clockMin / 60) >= t.sunsetHour) {
    invalid('Too late to leave today: it is already past sunset');
  }
  if (!Number.isInteger(plan.swimStops) || plan.swimStops < 0 || plan.swimStops > t.maxSwimStops) invalid(`swimStops must be 0..${t.maxSwimStops}`);
  if (!SHOWERS.includes(plan.shower)) invalid(`unknown shower discipline "${plan.shower}"`);
  let at = state.locationId;
  plan.legs.forEach((leg, i) => {
    const route = content.routes.find((r) => r.id === leg.routeId);
    if (!route) invalid(`Leg ${i + 1}: unknown route "${leg.routeId}"`);
    const next = otherEnd(route, at);
    if (!next) invalid(`Leg ${i + 1}: route ${route.id} does not start at ${at}`);
    if (!MODES.includes(leg.mode) || !REEFS.includes(leg.reefs) || !GENOAS.includes(leg.genoa) || !COURSES.includes(leg.course)) {
      invalid(`Leg ${i + 1}: invalid sail settings`);
    }
    at = next;
  });
  validateOrders(content, plan);
}

function logPlanDecisions(state: GameState, content: Content, plan: DayPlan): GameState {
  const t = content.balance.time;
  let s = appendLog(state, { kind: 'decision', cause: `plan:shower:${plan.shower}`, pillar: 'boat' });
  if (plan.legs.length === 0) return s;
  if (plan.autopilot) s = appendLog(s, { kind: 'decision', cause: 'plan:autopilot:on', pillar: 'boat' });
  const distance = plan.legs.reduce((sum, l) => sum + requireRoute(content, l.routeId).distanceNm, 0);
  const busy = distance >= t.busyRouteNm || plan.legs.length >= t.busyRouteLegs;
  s = appendLog(s, { kind: 'decision', cause: `plan:depart:${plan.departureHour > t.lateDepartureHour ? 'late' : 'early'}`, pillar: 'time', data: { hour: plan.departureHour } });
  s = appendLog(s, { kind: 'decision', cause: `plan:route:${busy ? 'busy' : 'easy'}`, pillar: 'time', data: { distanceNm: round1(distance), legs: plan.legs.length } });
  return plan.legs.reduce((acc, leg) => {
    const withMode = appendLog(acc, { kind: 'decision', cause: `plan:mode:${leg.mode}`, pillar: 'weather' });
    return leg.mode === 'sail' ? appendLog(withMode, { kind: 'decision', cause: `plan:reefs:${leg.reefs}`, pillar: 'weather' }) : withMode;
  }, s);
}

/** Swim stops that would start after sunset are skipped. Returns how many actually happened. */
function swimStops(state: GameState, boat: Boat, n: number, b: Balance): { state: GameState; swum: number } {
  return Array.from({ length: n }).reduce<{ state: GameState; swum: number }>((acc) => {
    if (acc.state.clockMin >= b.time.sunsetHour * 60) {
      return { ...acc, state: appendLog(acc.state, { kind: 'info', cause: 'activity:swim_skipped', pillar: 'time' }) };
    }
    const swum = applyOutcome(advanceClock(acc.state, b.time.swimStopMin), boat, { cause: 'activity:swim', pillar: 'time', effect: { mood: b.mood.swimStop } });
    return { state: swum, swum: acc.swum + 1 };
  }, { state, swum: 0 });
}

function settleDay(state: GameState, content: Content, boat: Boat, plan: DayPlan, d: DaySummary): GameState {
  const b = content.balance;
  const point = requirePoint(content, state.locationId);
  const s = d.moving ? applyOutcome(state, boat, { cause: 'fatigue:passage', pillar: 'time', effect: { fatigue: round1(d.legHours * b.fatigue.passagePerHour) } }) : state;
  const activities: Activity[] = [];
  if (d.swum > 0) activities.push('swim');
  if (point.services.beach && restHours(state.clockMin, b) > 0) activities.push('beach');
  const arrivalKind = d.mooring === 'anchor' && point.kind !== 'bay' ? 'bay' : point.kind;
  return {
    ...s,
    dayFacts: {
      day: s.day,
      departureHour: d.departureHour,
      arrivalHour: d.moving ? s.clockMin / 60 : null,
      arrivalPointKind: d.moving ? arrivalKind : null,
      mooring: d.mooring,
      activities,
      motorHours: round2(d.motor),
      sailHours: round2(d.sail),
      autopilotHours: plan.autopilot ? round2(d.legHours) : 0,
      shower: plan.shower,
    },
  };
}

function sail(state: GameState, content: Content, boat: Boat, plan: DayPlan): { state: GameState; summary: DaySummary } {
  const b = content.balance;
  const origin = requirePoint(content, state.locationId);
  let s = startEngine({ ...state, clockMin: Math.max(state.clockMin, Math.round(plan.departureHour * 60)) }, content, boat);
  const departureHour = s.clockMin / 60;
  s = runManeuver(s, content, origin.kind === 'bay' ? 'anchor_up' : 'departure', plan.maneuverOrders);
  s = advanceClock(s, b.time.departureMin);
  const start: DaySummary = { moving: true, departureHour, mooring: 'anchor', motor: b.time.departureMin / 60, sail: 0, legHours: 0, swum: 0 };
  const sailed = plan.legs.reduce((acc, leg) => {
    const r = runLeg(acc.state, content, boat, leg, acc.at);
    const sum = acc.summary;
    return {
      state: r.state,
      at: r.to,
      summary: { ...sum, motor: sum.motor + r.motorHours, sail: sum.sail + r.sailHours, legHours: sum.legHours + r.motorHours + r.sailHours },
    };
  }, { state: s, at: s.locationId, summary: start });
  const swim = swimStops({ ...sailed.state, locationId: sailed.at }, boat, plan.swimStops, b);
  const arrival = arrive(swim.state, content, boat, plan.maneuverOrders);
  return { state: arrival.state, summary: { ...sailed.summary, mooring: arrival.mooring, swum: swim.swum } };
}

export function planDay(state: GameState, content: Content, plan: DayPlan): GameState {
  assertPhase(state, 'planning');
  assertNoPendingEvent(state);
  validatePlan(state, content, plan);
  const boat = requireBoat(content, state);
  let s = logPlanDecisions(state, content, plan);
  let summary: DaySummary;
  if (plan.legs.length > 0) {
    const r = sail(s, content, boat, plan);
    s = r.state;
    summary = r.summary;
  } else {
    const swim = swimStops(s, boat, plan.swimStops, content.balance);
    s = swim.state;
    const here = requirePoint(content, s.locationId);
    summary = { moving: false, departureHour: null, mooring: here.kind === 'bay' ? 'anchor' : 'berth', motor: 0, sail: 0, legHours: 0, swum: swim.swum };
  }
  s = settleDay(s, content, boat, plan, summary);
  const phases: EventPhase[] = summary.moving ? ['passage', 'arrival', 'evening'] : ['evening'];
  s = phases.reduce((acc, phase) => queueEvent(acc, content, phase), s);
  return { ...s, phase: 'evening' };
}
