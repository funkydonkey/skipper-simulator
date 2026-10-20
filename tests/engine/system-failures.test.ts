import { describe, expect, it } from 'vitest';
import { planDay } from '../../src/engine/day/passage';
import { eligibleEvents, queueEvent } from '../../src/engine/events';
import { buildConditionContext } from '../../src/engine/expr';
import { addWear, failureEventIds, rollFailures } from '../../src/engine/systems';
import type { Content, DayFacts, GameState, SystemDef, SystemFailure } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const base = makeContent();
const failure = (over: Partial<SystemFailure> = {}): SystemFailure => ({
  id: 'f', phase: 'passage', chance: 1, effect: { break: 'test_sys' }, xp: { mechanic: 3 }, ...over,
});
const testSys = (failures: SystemFailure[], wearPer: SystemDef['wearPer'] = {}): SystemDef => ({
  id: 'test_sys', name: { ru: 'Тест', en: 'Test' }, wearPer, failures, brokenEffect: {}, repairs: [],
});
const withSys = (failures: SystemFailure[], wearPer?: SystemDef['wearPer']): Content => ({ ...base, systems: [...base.systems, testSys(failures, wearPer)] });
const onBoat = (over: Partial<GameState> = {}): GameState => {
  const s = makeState();
  return makeState({ systems: { ...s.systems, test_sys: { state: 'ok', wear: 0, broken: false } }, ...over });
};
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 9, arrivalHour: 12, arrivalPointKind: 'bay', mooring: 'anchor', activities: [],
  motorHours: 0, sailHours: 2, autopilotHours: 0, maxWindKn: 10, shower: 'normal', ...over,
});
const causes = (s: GameState): string[] => s.log.map((e) => e.cause);

describe('rollFailures', () => {
  it('a hit breaks the system, logs the break and grants XP', () => {
    const s0 = deepFreeze(onBoat());
    const r = rollFailures(s0, withSys([failure()]), 'passage');
    expect(r.state.systems.test_sys!.broken).toBe(true);
    expect(causes(r.state)).toEqual(expect.arrayContaining(['roll:failure:test_sys:f', 'break:test_sys:f', 'xp:mechanic:break:test_sys:f']));
    expect(r.state.voiceXp.mechanic).toBe(3);
    expect(r.state.log.find((e) => e.cause === 'roll:failure:test_sys:f')).toMatchObject({ kind: 'roll', data: { hit: true } });
    expect(r.state.rng).not.toBe(s0.rng);
    expect(r.queuedEvent).toBeUndefined();
  });

  it('a miss logs the roll only', () => {
    const r = rollFailures(onBoat(), withSys([failure({ chance: 0 })]), 'passage');
    expect(r.state.systems.test_sys!.broken).toBe(false);
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:f']);
    expect(r.state.log[0]).toMatchObject({ data: { hit: false } });
  });

  it('skips a failed `when` condition without consuming a draw', () => {
    const s = onBoat({ dayFacts: facts({ motorHours: 0 }) });
    const r = rollFailures(s, withSys([failure({ when: 'day.motor_hours > 0' })]), 'passage');
    expect(r.state.rng).toBe(s.rng);
    expect(r.state.log).toEqual([]);
  });

  it('rolls when `when` holds', () => {
    const s = onBoat({ dayFacts: facts({ motorHours: 1.5 }) });
    const r = rollFailures(s, withSys([failure({ when: 'day.motor_hours > 0' })]), 'passage');
    expect(r.state.systems.test_sys!.broken).toBe(true);
  });

  it('skips other phases, absent systems and already broken systems without a draw', () => {
    const c = withSys([failure()]);
    const other = onBoat();
    expect(rollFailures(other, c, 'evening').state.rng).toBe(other.rng);
    const absent = makeState();
    expect(rollFailures(absent, c, 'passage').state.rng).toBe(absent.rng);
    const broken = onBoat({ systems: { ...onBoat().systems, test_sys: { state: 'ok', wear: 0, broken: true } } });
    expect(rollFailures(broken, c, 'passage').state.rng).toBe(broken.rng);
  });

  it('wear feeds the chance: 30 wear at 0.01 per point shows odds 0.3', () => {
    const f = failure({ chance: { base: 0, mods: [{ per: 'system.test_sys.wear', add: 0.01 }] } });
    const s = onBoat({ systems: { ...onBoat().systems, test_sys: { state: 'ok', wear: 30, broken: false } } });
    const r = rollFailures(s, withSys([f]), 'passage');
    const entry = r.state.log.find((e) => e.cause === 'roll:failure:test_sys:f')!;
    expect(entry.odds!.value).toBeCloseTo(0.3, 10);
  });

  it('rolls in content order, one draw per eligible failure', () => {
    const c = withSys([failure({ id: 'a', chance: 0, effect: undefined, xp: undefined }), failure({ id: 'b', chance: 0, effect: undefined, xp: undefined })]);
    const r = rollFailures(onBoat(), c, 'passage');
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:a', 'roll:failure:test_sys:b']);
  });

  it('an event failure returns the event and stops later rolls', () => {
    const c = withSys([
      failure({ id: 'ev', effect: undefined, event: 'toilet_clog', xp: undefined, phase: 'evening' }),
      failure({ id: 'after', phase: 'evening' }),
    ]);
    const r = rollFailures(onBoat(), c, 'evening');
    expect(r.queuedEvent).toBe('toilet_clog');
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:ev', 'break:test_sys:ev']);
  });

  it('a no-event failure keeps rolling later ones', () => {
    const c = withSys([failure({ id: 'a', effect: undefined, xp: undefined }), failure({ id: 'b' })]);
    expect(causes(rollFailures(onBoat(), c, 'passage').state)).toContain('roll:failure:test_sys:b');
  });
});

describe('queueEvent with failure events', () => {
  const evFailure = failure({ id: 'ev', effect: undefined, event: 'toilet_clog', xp: undefined, phase: 'evening' });

  it('queues the failure event and skips the generic roll', () => {
    const c = withSys([evFailure]);
    const s = queueEvent(onBoat({ day: 3 }), c, 'evening');
    expect(s.eventQueue).toEqual(['toilet_clog']);
    expect(s.firedEvents).toContain('toilet_clog');
    expect(causes(s)).toEqual(['roll:failure:test_sys:ev', 'break:test_sys:ev', 'event:toilet_clog']);
  });

  it('failure events never appear as eligible generic events', () => {
    const c = withSys([evFailure]);
    expect(failureEventIds(c)).toEqual(new Set(['toilet_clog']));
    const s = onBoat({ day: 3 });
    expect(eligibleEvents(base, s, 'evening', buildConditionContext(s, base)).map((e) => e.id)).toEqual(['toilet_clog']);
    expect(eligibleEvents(c, s, 'evening', buildConditionContext(s, c))).toEqual([]);
  });
});

describe('addWear', () => {
  const c = withSys([], { motor_hour: 2, night: 1 });

  it('adds amount x wearPer only to systems with that key', () => {
    const s0 = deepFreeze(onBoat());
    const s = addWear(s0, c, 'motor_hour', 2.5);
    expect(s.systems.test_sys!.wear).toBe(5);
    expect(s.systems.engine_cooling!.wear).toBe(2.5);
    expect(s.systems.rig!.wear).toBe(0);
    expect(s.systems.heads!.wear).toBe(0);
    expect(s0.systems.test_sys!.wear).toBe(0);
  });

  it('ignores systems the boat lacks and does nothing for zero amount', () => {
    const s = makeState();
    expect(addWear(s, c, 'motor_hour', 1).systems.test_sys).toBeUndefined();
    expect(addWear(s, c, 'motor_hour', 0)).toBe(s);
  });
});

describe('wear in the day flow', () => {
  const plan = { departureHour: 9, legs: [{ routeId: 'r_base_bay_a', mode: 'sail' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const }], swimStops: 0, shower: 'normal' as const, autopilot: false };
  const quiet = { ...base, events: [] };

  it('planDay adds motor, sail and anchoring wear and records the max wind', () => {
    const s = planDay(makeState(), quiet, plan);
    expect(s.dayFacts!.maxWindKn).toBeGreaterThan(0);
    expect(s.systems.rig!.wear).toBe(s.dayFacts!.sailHours);
    expect(s.systems.engine_cooling!.wear).toBe(s.dayFacts!.motorHours);
  });

  it('maxWindKn is the maximum over legs', () => {
    const two = { ...plan, legs: [plan.legs[0]!, { ...plan.legs[0]!, routeId: 'r_bay_a_marina_b' }] };
    const one = planDay(makeState(), quiet, plan).dayFacts!.maxWindKn;
    const both = planDay(makeState(), quiet, two).dayFacts!.maxWindKn;
    expect(both).toBeGreaterThanOrEqual(one);
  });

  it('day.* keys read dayFacts, 0 without it', () => {
    expect(buildConditionContext(makeState(), base)).toMatchObject({ 'day.motor_hours': 0, 'day.sail_hours': 0, 'day.max_wind': 0 });
    const s = makeState({ dayFacts: facts({ motorHours: 1.5, sailHours: 2, maxWindKn: 17 }) });
    expect(buildConditionContext(s, base)).toMatchObject({ 'day.motor_hours': 1.5, 'day.sail_hours': 2, 'day.max_wind': 17 });
  });
});
