import { EngineError } from './errors';
import { bearingDeg, dirToDeg, planLeg } from './sailing';
import { otherEnd, requireBoat, requirePoint, requireRoute, requireTemplate, round1 } from './state';
import { restHours } from './time';
import type { Content, DayPlan, DayWeather, Dir8, GameState, LegPlan, MapPoint, PointOfSail, RouteFeature } from './types';
import { cautionTimeFactor } from './voices';
import { realWind } from './weather';

export interface LegPreview {
  routeId: string;
  from: string;
  to: string;
  distanceNm: number;
  features: RouteFeature[];
  /** Wind the captain expects on this leg (forecast; + local effect and visible front if known). */
  windKn: number;
  windDir: Dir8;
  localEffectKnown: boolean;
  pos: PointOfSail;
  speedKn: number;
  hours: number;
  overpowered: boolean;
  forcedReef: boolean;
}

export interface PlanPreview {
  legs: LegPreview[];
  departureMin: number | null;
  arrivalMin: number | null;
  destinationId: string;
  /** Swim stops that would start before sunset. */
  swimStops: number;
  arrivalAfterSunset: boolean;
  marinaLate: boolean;
  fuelNeededL: number;
  restHours: number;
}

interface Ctx { state: GameState; content: Content; weather: DayWeather; seesLocal: boolean }

function legPreview(ctx: Ctx, leg: LegPlan, from: string, clockMin: number): LegPreview {
  const { content, state } = ctx;
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  const wind = realWind(ctx.weather, ctx.seesLocal ? route.kLocal : 1, clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const boat = requireBoat(content, state);
  const res = planLeg({
    mode: leg.mode, windKn: wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  return {
    routeId: route.id, from, to, distanceNm: res.distanceNm, features: route.features,
    windKn: wind.windKn, windDir: wind.dir, localEffectKnown: ctx.seesLocal,
    pos: res.pos, speedKn: res.speedKn, hours: res.hours,
    overpowered: leg.mode === 'sail' && res.overpowered, forcedReef: leg.mode === 'sail' && res.forcedReef,
  };
}

function swimsBeforeSunset(clockMin: number, stops: number, content: Content): { count: number; clockMin: number } {
  const t = content.balance.time;
  let clock = clockMin;
  let count = 0;
  for (let i = 0; i < stops && clock < t.sunsetHour * 60; i++) {
    clock += t.swimStopMin;
    count++;
  }
  return { count, clockMin: clock };
}

function mooringMinutes(dest: MapPoint, late: boolean, state: GameState, content: Content): number {
  const t = content.balance.time;
  const anchoring = (t.anchorMin[0] + t.anchorMin[1]) / 2;
  const base = dest.kind === 'bay' ? anchoring : late ? t.marinaWaitMin + anchoring : t.marinaMooringMin;
  return base * cautionTimeFactor(state.voices.caution, content.balance);
}

/** What the captain can foresee for a plan. Pure: no RNG, no state change. */
export function previewPlan(state: GameState, content: Content, plan: DayPlan): PlanPreview {
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const b = content.balance;
  const weather = { ...state.weather, front: state.weather.front && state.weather.signalsVisible };
  const ctx: Ctx = { state, content, weather, seesLocal: state.voices.sea_sense >= b.voices.seaSenseSignalLevel };
  if (plan.legs.length === 0) {
    const swims = swimsBeforeSunset(state.clockMin, plan.swimStops, content);
    return {
      legs: [], departureMin: null, arrivalMin: null, destinationId: state.locationId, swimStops: swims.count,
      arrivalAfterSunset: false, marinaLate: false, fuelNeededL: 0, restHours: restHours(swims.clockMin, b),
    };
  }
  const departureMin = Math.max(state.clockMin, Math.round(plan.departureHour * 60));
  let clock = departureMin + b.time.departureMin;
  let at = state.locationId;
  const legs: LegPreview[] = [];
  for (const leg of plan.legs) {
    const p = legPreview(ctx, leg, at, clock);
    legs.push(p);
    clock += p.hours * 60 + (p.forcedReef ? b.sails.reefUnderwayMin : 0);
    at = p.to;
  }
  const swims = swimsBeforeSunset(clock, plan.swimStops, content);
  const dest = requirePoint(content, at);
  const marinaLate = dest.kind !== 'bay' && dest.placesGoneHour !== null && swims.clockMin / 60 > dest.placesGoneHour;
  const arrivalMin = Math.round(swims.clockMin + mooringMinutes(dest, marinaLate, state, content));
  const motorHours = legs.reduce((sum, l, i) => sum + (plan.legs[i]!.mode === 'motor' ? l.hours : 0), 0);
  return {
    legs, departureMin, arrivalMin, destinationId: at, swimStops: swims.count,
    arrivalAfterSunset: swims.clockMin >= b.time.sunsetHour * 60,
    marinaLate,
    fuelNeededL: round1(motorHours * b.fuel.motorLph),
    restHours: restHours(arrivalMin, b),
  };
}
