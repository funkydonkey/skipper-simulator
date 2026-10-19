import { describe, expect, it } from 'vitest';
import { bearingDeg, breakChance, dirToDeg, motorSpeedKn, planLeg, pointOfSail, reefThresholdKn, sailSpeedKn } from '../../src/engine/sailing';
import { makeContent } from '../fixtures/content';

const b = makeContent().balance;

describe('sailing', () => {
  it('bearing and directions', () => {
    expect(bearingDeg({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(0);
    expect(bearingDeg({ x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(90);
    expect(bearingDeg({ x: 0, y: 0 }, { x: -10, y: 0 })).toBeCloseTo(270);
    expect(dirToDeg('NW')).toBe(315);
  });

  it('pointOfSail by angle between course and wind source', () => {
    expect(pointOfSail(0, 315)).toBe('upwind');
    expect(pointOfSail(90, 0)).toBe('reach');
    expect(pointOfSail(180, 0)).toBe('run');
  });

  it('reef thresholds from ТЗ 4.4 (16/22/28) + partial genoa bonus', () => {
    expect(reefThresholdKn(0, 'full', b)).toBe(16);
    expect(reefThresholdKn(1, 'full', b)).toBe(22);
    expect(reefThresholdKn(2, 'full', b)).toBe(28);
    expect(reefThresholdKn(0, 'partial', b)).toBe(19);
  });

  it('break chance grows per knot over threshold, capped', () => {
    expect(breakChance(15, 0, 'full', b)).toBe(0);
    expect(breakChance(20, 0, 'full', b)).toBeCloseTo(0.12);
    expect(breakChance(20, 0, 'partial', b)).toBeCloseTo(0.03);
    expect(breakChance(60, 0, 'full', b)).toBe(0.6);
  });

  it('sail speed depends on wind, point of sail, area, overpowering', () => {
    expect(sailSpeedKn({ windKn: 12, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(6.4);
    expect(sailSpeedKn({ windKn: 12, pos: 'upwind', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(4.1);
    expect(sailSpeedKn({ windKn: 12, pos: 'reach', reefs: 1, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(5.4);
    expect(sailSpeedKn({ windKn: 20, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(5.1);
    expect(sailSpeedKn({ windKn: 3, pos: 'reach', reefs: 0, genoa: 'full', hullSpeedKn: 7.5 }, b)).toBe(1.1);
  });

  it('motor speed drops upwind in strong wind', () => {
    expect(motorSpeedKn(6.5, 10, 'upwind', b)).toBe(6.5);
    expect(motorSpeedKn(6.5, 22, 'upwind', b)).toBe(4.9);
    expect(motorSpeedKn(6.5, 22, 'run', b)).toBe(6.5);
  });

  const leg = { mode: 'sail' as const, windKn: 12, windFromDeg: 0, courseDeg: 0, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const, distanceNm: 10, hullSpeedKn: 7.5, motorKn: 6.5 };

  it('planLeg direct upwind vs detour (reach, longer)', () => {
    const direct = planLeg(leg, b);
    expect(direct).toMatchObject({ pos: 'upwind', distanceNm: 10, speedKn: 4.1, hours: 2.44, overpowered: false, breakChance: 0, forcedReef: false });
    const detour = planLeg({ ...leg, course: 'detour' }, b);
    expect(detour).toMatchObject({ pos: 'reach', distanceNm: 13, speedKn: 6.4, hours: 2.03 });
  });

  it('planLeg flags overpowering and forced reef', () => {
    const r = planLeg({ ...leg, windKn: 21, windFromDeg: 90 }, b);
    expect(r.overpowered).toBe(true);
    expect(r.forcedReef).toBe(true);
    expect(planLeg({ ...leg, windKn: 18, windFromDeg: 90 }, b).forcedReef).toBe(false);
  });

  it('planLeg motor ignores sails and detour', () => {
    const r = planLeg({ ...leg, mode: 'motor', course: 'detour', windKn: 25 }, b);
    expect(r).toMatchObject({ distanceNm: 10, speedKn: 4.9, overpowered: false, breakChance: 0, forcedReef: false });
  });
});
