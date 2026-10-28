import { canAfford } from './budget';
import { evaluateChance } from './chance';
import { resolveMode } from './day/legs';
import { EngineError } from './errors';
import { buildConditionContext, type CondContext } from './expr';
import { berthFee } from './berths';
import { anchorFailSpec, marinaRefusalSpec, sailBreakSpec } from './odds';
import { bearingDeg, dirToDeg, planLeg } from './sailing';
import { otherEnd, requireBoat, requirePoint, requireRoute, requireTemplate, round1 } from './state';
import { forecastAt } from './situation';
import { brokenFlags, type BrokenFlags } from './systems';
import { restHours } from './time';
import type { BerthType, ChanceValue, Content, DayPlan, DayWeather, Dir8, GameState, LegPlan, MapPoint, PointOfSail, RouteFeature, Seabed, Situation } from './types';
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
  /** The mode the captain chose for this leg. */
  plannedMode: LegPlan['mode'];
  /** The mode the boat will actually use: broken systems may force the other one. */
  mode: LegPlan['mode'];
  /** Set when the leg ends under tow (no usable engine and too little wind, or neither engine nor sails). */
  tow: { eur: number; hours: number } | null;
  pos: PointOfSail;
  speedKn: number;
  hours: number;
  overpowered: boolean;
  forcedReef: boolean;
  /** Odds of tearing a sail on this leg (0 under motor). */
  breakChance: ChanceValue;
}

export interface PlanPreview {
  legs: LegPreview[];
  departureMin: number | null;
  arrivalMin: number | null;
  destinationId: string;
  /** Swim stops that would start before sunset. */
  swimStops: number;
  arrivalAfterSunset: boolean;
  /** Arrives after `time.latestArrivalHour`: validatePlan rejects such a plan (TOO_LATE). */
  arrivalTooLate: boolean;
  marinaLate: boolean;
  fuelNeededL: number;
  restHours: number;
  /** Refusal odds at a destination marina or quay; null for a bay or when staying. */
  marinaRefusal: ChanceValue | null;
  /** False when the destination's fee for the planned berth (after the economist discount) exceeds the money; the boat then anchors outside. */
  marinaAffordable: boolean;
  /** Per-attempt anchor-drag odds at a destination bay for the planned berth; null otherwise. */
  anchorFail: ChanceValue | null;
  destinationSeabed: Seabed;
  /** The forecast berth situation at the destination; null on a stay day. */
  situation: Situation | null;
  /** Berth types the destination offers (the current point on a stay day); the first is the default. */
  berths: BerthType[];
  /** The fee in euro per berth (side-to costs more; after the economist discount) at a priced destination; empty when free or staying. */
  berthFees: Partial<Record<BerthType, number>>;
}

interface Ctx { state: GameState; content: Content; weather: DayWeather; seesLocal: boolean; cond: CondContext; flags: BrokenFlags }

function legPreview(ctx: Ctx, leg: LegPlan, from: string, clockMin: number): LegPreview {
  const { content, state } = ctx;
  const b = content.balance;
  const route = requireRoute(content, leg.routeId);
  const to = otherEnd(route, from);
  if (!to) throw new EngineError('INVALID_INPUT', `Route ${route.id} does not start at ${from}`);
  const wind = realWind(ctx.weather, ctx.seesLocal ? route.kLocal : 1, clockMin / 60, requireTemplate(content, state.weatherTemplateId), b);
  const boat = requireBoat(content, state);
  // Fuel is not modelled here: a short tank has its own warning (fuelNeededL), so only broken systems change the mode.
  const { mode, drift, tow } = resolveMode(leg.mode, Infinity, ctx.flags, route.id, wind.windKn, b);
  const res = planLeg({
    mode, windKn: drift ? 0 : wind.windKn, windFromDeg: dirToDeg(wind.dir),
    courseDeg: bearingDeg(requirePoint(content, from), requirePoint(content, to)),
    reefs: leg.reefs, genoa: leg.genoa, course: leg.course, distanceNm: route.distanceNm,
    hullSpeedKn: boat.hullSpeedKn, motorKn: boat.motorKn,
  }, b);
  const sailing = mode === 'sail' && !tow;
  const towHours = b.rescue.towHours;
  return {
    routeId: route.id, from, to, distanceNm: res.distanceNm, features: route.features,
    windKn: wind.windKn, windDir: wind.dir, localEffectKnown: ctx.seesLocal,
    plannedMode: leg.mode, mode, tow: tow ? { eur: b.rescue.towEur, hours: towHours } : null,
    pos: res.pos,
    speedKn: tow ? round1(res.distanceNm / towHours) : res.speedKn,
    hours: tow ? towHours : res.hours,
    overpowered: sailing && res.overpowered, forcedReef: sailing && res.forcedReef,
    breakChance: evaluateChance(sailBreakSpec(sailing ? res.breakChance : 0, b), ctx.cond),
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

/** Minutes from reaching the destination to being moored; the stern line ashore adds its time unscaled, as arrive() does. */
function mooringMinutes(dest: MapPoint, berth: BerthType, late: boolean, state: GameState, content: Content): number {
  const b = content.balance;
  const t = b.time;
  const anchoring = (t.anchorMin[0] + t.anchorMin[1]) / 2;
  const base = dest.kind === 'bay' ? anchoring : late ? t.marinaWaitMin + anchoring : t.marinaMooringMin;
  const ashore = berth === 'anchor_ashore' ? b.berths.ashoreTimeHours * 60 : 0;
  return base * cautionTimeFactor(state.voices.caution, b) + ashore;
}

/** The clock arrive() settles the situation at: on reaching a bay; at a marina or quay after the wait for a place when late. */
function settleClock(dest: MapPoint, reachedMin: number, late: boolean, content: Content): number {
  return dest.kind !== 'bay' && late ? reachedMin + content.balance.time.marinaWaitMin : reachedMin;
}

/** Odds the captain can foresee at the destination, on arrival at `clockMin`. */
function arrivalOdds(ctx: Ctx, dest: MapPoint, berth: BerthType, clockMin: number, marinaLate: boolean): Pick<PlanPreview, 'marinaRefusal' | 'anchorFail'> {
  const b = ctx.content.balance;
  if (dest.kind !== 'bay') {
    return { marinaRefusal: evaluateChance(marinaRefusalSpec(b), { ...ctx.cond, 'marina.late': marinaLate }), anchorFail: null };
  }
  const wind = realWind(ctx.weather, 1, clockMin / 60, requireTemplate(ctx.content, ctx.state.weatherTemplateId), b);
  const night = clockMin >= b.time.sunsetHour * 60;
  return { marinaRefusal: null, anchorFail: evaluateChance(anchorFailSpec(b), { ...ctx.cond, 'place.seabed': dest.seabed, 'place.berth': berth, wind: wind.windKn, night }) };
}

/** Today's weather as the captain sees it: a front counts only when its signals are visible. */
export function visibleWeather(w: DayWeather): DayWeather {
  return { ...w, front: w.front && w.signalsVisible };
}

/** The planned berth if the destination has it, else its default: the preview follows route edits without throwing. */
function plannedBerth(dest: MapPoint, plan: DayPlan): BerthType {
  return dest.berths.some((x) => x.type === plan.berth) ? plan.berth! : dest.berths[0]!.type;
}

/** The fee for `berth` (side-to costs more) is within the money. */
function affordable(state: GameState, dest: MapPoint, berth: BerthType, content: Content): boolean {
  if (dest.kind === 'bay' || dest.priceEur <= 0) return true;
  return canAfford(state, berthFee(dest, berth, state.voices.economist, content.balance)?.eur ?? 0);
}

function berthFees(state: GameState, dest: MapPoint, content: Content): Partial<Record<BerthType, number>> {
  if (dest.kind === 'bay' || dest.priceEur <= 0) return {};
  return Object.fromEntries(dest.berths.map((x) => [x.type, berthFee(dest, x.type, state.voices.economist, content.balance)?.eur ?? 0]));
}

/** What the captain can foresee for a plan. Pure: no RNG, no state change. */
export function previewPlan(state: GameState, content: Content, plan: DayPlan): PlanPreview {
  if (!state.weather) throw new EngineError('WRONG_PHASE', 'No weather for today: call startDay first');
  const b = content.balance;
  const weather = visibleWeather(state.weather);
  const seesLocal = state.voices.sea_sense >= b.voices.seaSenseSignalLevel;
  const ctx: Ctx = { state, content, weather, seesLocal, cond: buildConditionContext(state, content), flags: brokenFlags(state, content) };
  if (plan.legs.length === 0) {
    const here = requirePoint(content, state.locationId);
    const swims = swimsBeforeSunset(state.clockMin, plan.swimStops, content);
    return {
      legs: [], departureMin: null, arrivalMin: null, destinationId: state.locationId, swimStops: swims.count,
      arrivalAfterSunset: false, arrivalTooLate: false, marinaLate: false, fuelNeededL: 0, restHours: restHours(swims.clockMin, b),
      marinaRefusal: null, marinaAffordable: true, anchorFail: null, destinationSeabed: here.seabed,
      situation: null, berths: here.berths.map((x) => x.type), berthFees: {},
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
  const berth = plannedBerth(dest, plan);
  const arrivalMin = Math.round(swims.clockMin + mooringMinutes(dest, berth, marinaLate, state, content));
  const motorHours = legs.reduce((sum, l) => sum + (l.mode === 'motor' && !l.tow ? l.hours : 0), 0);
  return {
    legs, departureMin, arrivalMin, destinationId: at, swimStops: swims.count,
    arrivalAfterSunset: swims.clockMin >= b.time.sunsetHour * 60,
    arrivalTooLate: arrivalMin > b.time.latestArrivalHour * 60,
    marinaLate,
    fuelNeededL: round1(motorHours * (requireBoat(content, state).motorLph ?? b.fuel.motorLph)),
    restHours: restHours(arrivalMin, b),
    ...arrivalOdds(ctx, dest, berth, swims.clockMin, marinaLate),
    marinaAffordable: affordable(state, dest, berth, content),
    destinationSeabed: dest.seabed,
    situation: forecastAt(state, content, weather, dest, berth, settleClock(dest, swims.clockMin, marinaLate, content)),
    berths: dest.berths.map((x) => x.type),
    berthFees: berthFees(state, dest, content),
  };
}

/** What the plan promises at the destination (the preview's situation). Pure: no RNG. Null on a stay day. */
export function forecastSituation(state: GameState, content: Content, plan: DayPlan): Situation | null {
  if (plan.legs.length === 0 || !state.weather) return null;
  return previewPlan(state, content, plan).situation;
}
