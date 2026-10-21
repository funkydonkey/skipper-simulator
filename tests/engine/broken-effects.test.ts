import { describe, expect, it } from 'vitest';
import { evaluateChance } from '../../src/engine/chance';
import { runManeuver } from '../../src/engine/day/arrival';
import { endDay } from '../../src/engine/day/evening';
import { planDay } from '../../src/engine/day/passage';
import { maneuverRisk } from '../../src/engine/maneuver';
import { buildConditionContext } from '../../src/engine/expr';
import { injurySpec } from '../../src/engine/odds';
import { brokenFlags } from '../../src/engine/systems';
import type { Content, DayFacts, DayPlan, GameState, LegPlan, SystemDef, SystemId } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const sys = (id: string, brokenEffect: SystemDef['brokenEffect']): SystemDef => ({
  id, name: { ru: id, en: id }, failures: [], brokenEffect, repairs: [],
});
const fixture = makeContent();
const content: Content = {
  ...fixture,
  systems: [
    ...fixture.systems,
    sys('windlass', { anchorEffect: { time_hours: 0.5, fatigue: 10 } }),
    sys('electrical', { noCharge: true }),
    sys('gas', { noCook: true }),
  ],
  events: [],
};
const brokenState = (...ids: SystemId[]): GameState => {
  const s = makeState();
  const systems = { ...s.systems };
  for (const id of ids) systems[id] = { state: 'ok', wear: 0, broken: true };
  return makeState({ systems });
};
const leg = (mode: LegPlan['mode'], routeId = 'r_base_bay_a'): LegPlan => ({ routeId, mode, reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[]): DayPlan => ({ departureHour: 9, legs, swimStops: 0, shower: 'normal', autopilot: false });
const causes = (s: GameState): string[] => s.log.map((e) => e.cause);
const legMode = (s: GameState): unknown => s.log.find((e) => e.cause.startsWith('leg:'))!.data!.mode;
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 9, arrivalHour: 12, arrivalPointKind: 'bay', mooring: 'anchor', activities: [],
  motorHours: 0, sailHours: 0, autopilotHours: 0, maxWindKn: 10, shower: 'normal', ...over,
});
const evening = (s: GameState, over: Partial<GameState> = {}): GameState => ({ ...s, phase: 'evening', dayFacts: facts(), ...over });

describe('brokenFlags', () => {
  it('ORs boolean flags over broken systems only', () => {
    expect(brokenFlags(makeState(), content)).toEqual({ noMotor: false, noSail: false, noCharge: false, noCook: false });
    expect(brokenFlags(brokenState('engine_cooling', 'rig'), content)).toEqual({ noMotor: true, noSail: true, noCharge: false, noCook: false });
  });
});

describe('legs with broken systems', () => {
  it('engine_cooling: a motor leg runs as sail, burns no fuel, logs the cause, skips engine start', () => {
    const s = planDay(deepFreeze(brokenState('engine_cooling')), content, plan([leg('motor')]));
    expect(legMode(s)).toBe('sail');
    expect(s.resources.fuelL).toBe(150);
    expect(causes(s)).toContain('system:no_motor:r_base_bay_a');
    expect(causes(s)).not.toContain('engine:start');
    expect(causes(s)).not.toContain('consumption:fuel');
  });

  it('rig: a sail leg runs as motor and logs the cause', () => {
    const s = planDay(brokenState('rig'), content, plan([leg('sail')]));
    expect(legMode(s)).toBe('motor');
    expect(s.resources.fuelL).toBeLessThan(150);
    expect(causes(s)).toContain('system:no_sail:r_base_bay_a');
  });

  it('both broken: drifts under sail at drifter speed, no fuel burn, both causes logged', () => {
    const s = planDay(brokenState('engine_cooling', 'rig'), content, plan([leg('motor')]));
    const info = s.log.find((e) => e.cause.startsWith('leg:'))!.data!;
    const b = content.balance;
    expect(info.mode).toBe('sail');
    expect(info.speedKn).toBe(Math.round(7.5 * b.sails.drifterFactor * 10) / 10);
    expect(s.resources.fuelL).toBe(150);
    expect(causes(s)).toEqual(expect.arrayContaining(['system:no_motor:r_base_bay_a', 'system:no_sail:r_base_bay_a']));
  });

  it('engine_cooling: departure adds no motor time, wear, starter refill or motor-gated failure roll', () => {
    const motorGated: SystemDef = {
      ...sys('electrical', { noCharge: true }),
      failures: [{ id: 'alt', phase: 'passage', when: 'day.motor_hours > 0', chance: 1 }],
    };
    const c: Content = { ...content, systems: [...content.systems.filter((d) => d.id !== 'electrical'), motorGated] };
    const start = brokenState('engine_cooling');
    const low = { ...start, resources: { ...start.resources, starterBankPct: 50 } };
    const s = planDay(deepFreeze(low), c, plan([leg('sail')]));
    expect(s.dayFacts!.motorHours).toBe(0);
    expect(s.systems.engine_cooling!.wear).toBe(0);
    expect(causes(s)).not.toContain('roll:failure:electrical:alt');
    const night = endDay(s, c, { dinner: 'cook' });
    expect(causes(night)).not.toContain('charge:starter');
    expect(night.resources.starterBankPct).toBe(50);
  });

  it('a working engine still counts the departure as motor time', () => {
    const s = planDay(makeState(), content, plan([leg('sail')]));
    expect(s.dayFacts!.motorHours).toBe(content.balance.time.departureMin / 60);
  });

  it('engine_cooling at 3 kn wind: the leg still completes at drifter speed', () => {
    const start = brokenState('engine_cooling');
    const calm = { ...start, weather: { ...start.weather!, forecastKn: 3, forecastGustKn: 4 } };
    const s = planDay(calm, content, plan([leg('motor')]));
    expect(s.phase).toBe('evening');
    expect(s.locationId).toBe('bay_a');
    expect(s.clockMin).toBeGreaterThan(9 * 60);
    expect(causes(s)).toContain('system:no_motor:r_base_bay_a');
  });
});

describe('electrical: noCharge', () => {
  const night = (s: GameState): number => endDay(evening(s, { dayFacts: facts({ motorHours: 3, mooring: 'anchor' }) }), content, { dinner: 'cook' }).resources.serviceBankPct;

  it('3 motor hours add no engine charge', () => {
    const ok = night(makeState({ resources: { ...makeState().resources, serviceBankPct: 50 } }));
    const base = makeState({ resources: { ...makeState().resources, serviceBankPct: 50 } });
    const broken = night({ ...base, systems: { ...base.systems, electrical: { state: 'ok', wear: 0, broken: true } } });
    const gain = content.balance.electric.engineChargeAhPerHour * 3;
    expect(ok - broken).toBeCloseTo((gain / (110 * 2)) * 100, 0);
  });

  it('blocks the starter recharge from the engine', () => {
    const base = makeState({ resources: { ...makeState().resources, starterBankPct: 40 } });
    const broken = { ...base, systems: { ...base.systems, electrical: { state: 'ok' as const, wear: 0, broken: true } } };
    const after = endDay(evening(broken, { dayFacts: facts({ motorHours: 3, mooring: 'anchor' }) }), content, { dinner: 'cook' });
    expect(after.log.map((e) => e.cause)).not.toContain('charge:starter');
    expect(after.resources.starterBankPct).toBe(40);
    const working = endDay(evening(base, { dayFacts: facts({ motorHours: 3, mooring: 'anchor' }) }), content, { dinner: 'cook' });
    expect(working.resources.starterBankPct).toBe(100);
  });
});

describe('night and evening effects', () => {
  it('heads: dailyEffect mood -8 applied once per night', () => {
    const base = evening(makeState());
    const brokenHeads = { ...base, systems: { ...base.systems, heads: { state: 'ok' as const, wear: 0, broken: true } } };
    const s = endDay(brokenHeads, content, { dinner: 'cook' });
    const ref = endDay(base, content, { dinner: 'cook' });
    expect(s.log.filter((e) => e.cause === 'system:daily:heads')).toHaveLength(1);
    expect(ref.resources.mood - s.resources.mood).toBeCloseTo(8, 5);
  });

  it('gas: cooking gives the no-hot-food penalty and logs system:no_cook', () => {
    const base = evening(makeState());
    const s = endDay({ ...base, systems: { ...base.systems, gas: { state: 'ok', wear: 0, broken: true } } }, content, { dinner: 'cook' });
    const ref = endDay(base, content, { dinner: 'cook' });
    expect(causes(s)).toEqual(expect.arrayContaining(['zero:gas', 'system:no_cook']));
    expect(s.resources.gasPct).toBe(100);
    expect(ref.resources.mood - s.resources.mood).toBeCloseTo(content.balance.gas.noHotFoodMoodPenalty, 5);
    expect(causes(ref)).not.toContain('system:no_cook');
  });

  it('gas: the taverna dinner is unaffected', () => {
    const base = evening(makeState(), { locationId: 'marina_b', clockMin: 17 * 60 });
    const s = endDay({ ...base, systems: { ...base.systems, gas: { state: 'ok', wear: 0, broken: true } } }, content, { dinner: 'taverna' });
    expect(causes(s)).not.toContain('system:no_cook');
  });
});

describe('windlass: anchorEffect', () => {
  const windlass = (): GameState => { const s = makeState(); return { ...s, systems: { ...s.systems, windlass: { state: 'ok', wear: 0, broken: true } } }; };

  it('anchoring adds 0.5 h and fatigue 10', () => {
    const ok = runManeuver(makeState(), content, 'anchoring');
    const s = runManeuver(windlass(), content, 'anchoring');
    expect(causes(s)).toContain('system:anchor:windlass');
    expect(s.clockMin - ok.clockMin).toBe(30);
    expect(s.resources.fatigue - ok.resources.fatigue).toBe(10);
  });

  it('anchor_up too; other maneuvers do not', () => {
    expect(causes(runManeuver(windlass(), content, 'anchor_up'))).toContain('system:anchor:windlass');
    expect(causes(runManeuver(windlass(), content, 'mooring'))).not.toContain('system:anchor:windlass');
  });
});

describe('injurySpec extra mods', () => {
  it('adds apply before the muls', () => {
    const b = content.balance;
    const ctx = buildConditionContext(makeState(), content);
    const plain = evaluateChance(injurySpec(0.2, undefined, b), ctx).value;
    const extra = evaluateChance(injurySpec(0.2, undefined, b, [{ add: 0.1, label: 'broken' }]), ctx).value;
    const muls = plain / 0.2;
    expect(extra).toBeCloseTo(0.3 * muls, 10);
  });

  it('a maneuver injuryMods entry shows in maneuverRisk', () => {
    const m = content.maneuvers.find((x) => x.kind === 'departure')!;
    const withMods: Content = { ...content, maneuvers: content.maneuvers.map((x) => (x === m ? { ...m, injuryMods: [{ if: 'system.engine_cooling.broken', add: 0.1, label: 'broken' }] } : x)) };
    const ok = maneuverRisk(makeState(), withMods, 'departure')!.value;
    const broken = maneuverRisk(brokenState('engine_cooling'), withMods, 'departure')!.value;
    expect(broken / ok).toBeCloseTo(0.3 / 0.2, 10);
  });
});
