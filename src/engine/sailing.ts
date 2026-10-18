import { round1, round2 } from './state';
import { DIRS, type Balance, type Dir8, type PointOfSail } from './types';

type Reefs = 0 | 1 | 2;
type Genoa = 'full' | 'partial';

export interface LegInput {
  mode: 'motor' | 'sail';
  windKn: number;
  windFromDeg: number;
  courseDeg: number;
  reefs: Reefs;
  genoa: Genoa;
  course: 'direct' | 'detour';
  distanceNm: number;
  hullSpeedKn: number;
  motorKn: number;
}

export interface LegResult {
  pos: PointOfSail;
  distanceNm: number;
  speedKn: number;
  hours: number;
  overpowered: boolean;
  breakChance: number;
  forcedReef: boolean;
}

export function bearingDeg(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const deg = (Math.atan2(to.x - from.x, to.y - from.y) * 180) / Math.PI;
  return (deg + 360) % 360;
}

export const dirToDeg = (d: Dir8): number => DIRS.indexOf(d) * 45;

function angleDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export function pointOfSail(courseDeg: number, windFromDeg: number): PointOfSail {
  const a = angleDiff(courseDeg, windFromDeg);
  if (a < 60) return 'upwind';
  return a < 120 ? 'reach' : 'run';
}

export function reefThresholdKn(reefs: Reefs, genoa: Genoa, b: Balance): number {
  return b.sails.reefThresholdKn[reefs] + (genoa === 'partial' ? b.sails.partialGenoaBonusKn : 0);
}

export function breakChance(windKn: number, reefs: Reefs, genoa: Genoa, b: Balance): number {
  const over = windKn - reefThresholdKn(reefs, genoa, b);
  return over <= 0 ? 0 : Math.min(b.sails.breakChanceMax, over * b.sails.breakChancePerKnOver);
}

export function sailSpeedKn(i: { windKn: number; pos: PointOfSail; reefs: Reefs; genoa: Genoa; hullSpeedKn: number }, b: Balance): number {
  if (i.windKn < b.sails.minSailWindKn) return round1(i.hullSpeedKn * b.sails.drifterFactor);
  const power = Math.min(1, i.windKn / b.sails.fullPowerWindKn);
  const area = b.sails.reefFactor[i.reefs] * (i.genoa === 'partial' ? b.sails.partialGenoaFactor : 1);
  const overpowered = i.windKn > reefThresholdKn(i.reefs, i.genoa, b);
  const penalty = overpowered ? b.sails.overpowerSpeedFactor : 1;
  return round1(i.hullSpeedKn * power * b.sails.posFactor[i.pos] * area * penalty);
}

export function motorSpeedKn(motorKn: number, windKn: number, pos: PointOfSail, b: Balance): number {
  const slowed = pos === 'upwind' && windKn >= b.sails.motorUpwindPenaltyWindKn;
  return round1(motorKn * (slowed ? b.sails.motorUpwindFactor : 1));
}

export function planLeg(i: LegInput, b: Balance): LegResult {
  const directPos = pointOfSail(i.courseDeg, i.windFromDeg);
  if (i.mode === 'motor') {
    const speedKn = motorSpeedKn(i.motorKn, i.windKn, directPos, b);
    return { pos: directPos, distanceNm: i.distanceNm, speedKn, hours: round2(i.distanceNm / speedKn), overpowered: false, breakChance: 0, forcedReef: false };
  }
  const detour = i.course === 'detour';
  const pos: PointOfSail = detour && directPos === 'upwind' ? 'reach' : directPos;
  const distanceNm = round1(i.distanceNm * (detour ? b.sails.detourDistanceFactor : 1));
  const threshold = reefThresholdKn(i.reefs, i.genoa, b);
  const speedKn = sailSpeedKn({ windKn: i.windKn, pos, reefs: i.reefs, genoa: i.genoa, hullSpeedKn: i.hullSpeedKn }, b);
  return {
    pos,
    distanceNm,
    speedKn,
    hours: round2(distanceNm / speedKn),
    overpowered: i.windKn > threshold,
    breakChance: breakChance(i.windKn, i.reefs, i.genoa, b),
    forcedReef: i.windKn > threshold + b.sails.forcedReefMarginKn,
  };
}
