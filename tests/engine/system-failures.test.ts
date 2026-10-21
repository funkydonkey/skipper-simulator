import { describe, expect, it } from 'vitest';
import { endDay } from '../../src/engine/day/evening';
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
  it('a hit logs the fault, breaks the system, logs the break and grants XP for the fault', () => {
    const s0 = deepFreeze(onBoat());
    const r = rollFailures(s0, withSys([failure()]), 'passage');
    expect(r.state.systems.test_sys!.broken).toBe(true);
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:f', 'fault:test_sys:f', 'break:test_sys', 'xp:mechanic:fault:test_sys:f']);
    expect(r.state.voiceXp.mechanic).toBe(3);
    expect(r.state.log.find((e) => e.cause === 'roll:failure:test_sys:f')).toMatchObject({ kind: 'roll', data: { hit: true } });
    expect(r.state.rng).not.toBe(s0.rng);
    expect(r.queuedEvent).toBeUndefined();
  });

  it('the fault line carries the odds it fired with', () => {
    const f = failure({ chance: { base: 0.5, mods: [{ add: 0.5 }] } });
    const r = rollFailures(onBoat(), withSys([f]), 'passage');
    const fault = r.state.log.find((e) => e.cause === 'fault:test_sys:f')!;
    expect(fault).toMatchObject({ kind: 'effect', pillar: 'boat' });
    expect(fault.odds).toEqual(r.state.log.find((e) => e.cause === 'roll:failure:test_sys:f')!.odds);
    expect(fault.odds!.value).toBe(1);
  });

  it('a failure without a break effect logs a fault, never a break', () => {
    const r = rollFailures(onBoat(), withSys([failure({ effect: undefined, xp: undefined })]), 'passage');
    expect(r.state.systems.test_sys!.broken).toBe(false);
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:f', 'fault:test_sys:f']);
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
    expect(causes(r.state)).toEqual(['roll:failure:test_sys:ev', 'fault:test_sys:ev']);
  });

  it('a no-event failure keeps rolling later ones', () => {
    const c = withSys([failure({ id: 'a', effect: undefined, xp: undefined }), failure({ id: 'b' })]);
    expect(causes(rollFailures(onBoat(), c, 'passage').state)).toContain('roll:failure:test_sys:b');
  });
});

describe('failure events respect queue and once', () => {
  const evFailure = failure({ id: 'ev', effect: undefined, event: 'toilet_clog', xp: undefined, phase: 'evening' });
  const c = withSys([evFailure]);

  it('does not roll while the event is queued', () => {
    const s = onBoat({ eventQueue: ['toilet_clog'] });
    const r = rollFailures(s, c, 'evening');
    expect(r.queuedEvent).toBeUndefined();
    expect(r.state.rng).toBe(s.rng);
  });

  it('does not roll once the once-event has fired', () => {
    const s = onBoat({ firedEvents: ['toilet_clog'] });
    const r = rollFailures(s, c, 'evening');
    expect(r.queuedEvent).toBeUndefined();
    expect(r.state.rng).toBe(s.rng);
  });

  it('still rolls for a fired event that is not once', () => {
    const repeat = { ...c, events: c.events.map((e) => ({ ...e, trigger: { ...e.trigger, once: false } })) };
    expect(rollFailures(onBoat({ firedEvents: ['toilet_clog'] }), repeat, 'evening').queuedEvent).toBe('toilet_clog');
  });
});

describe('queueEvent with failure events', () => {
  const evFailure = failure({ id: 'ev', effect: undefined, event: 'toilet_clog', xp: undefined, phase: 'evening' });

  it('queues the failure event and skips the generic roll', () => {
    const c = withSys([evFailure]);
    const s = queueEvent(onBoat({ day: 3 }), c, 'evening');
    expect(s.eventQueue).toEqual(['toilet_clog']);
    expect(s.firedEvents).toContain('toilet_clog');
    expect(causes(s)).toEqual(['roll:failure:test_sys:ev', 'fault:test_sys:ev', 'event:toilet_clog']);
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

  it('maxWindKn is exactly the strongest leg wind, not the last or the sum', () => {
    const l = plan.legs[0]!;
    const three = { ...plan, legs: [l, { ...l, routeId: 'r_bay_a_marina_b' }, { ...l, routeId: 'r_marina_b_base' }] };
    const s = planDay(makeState(), quiet, three);
    const winds = s.log.filter((e) => e.cause.startsWith('leg:')).map((e) => e.data!.windKn as number);
    expect(winds).toHaveLength(3);
    expect(new Set(winds).size).toBeGreaterThan(1);
    expect(s.dayFacts!.maxWindKn).toBe(Math.max(...winds));
    const single = planDay(makeState(), quiet, plan);
    expect(single.dayFacts!.maxWindKn).toBe(single.log.find((e) => e.cause.startsWith('leg:'))!.data!.windKn);
  });

  it('adds anchoring wear on anchoring and night wear at endDay', () => {
    const c = { ...quiet, systems: [...quiet.systems, testSys([], { anchoring: 2, night: 3 })] };
    const s = planDay(onBoat(), c, plan);
    expect(s.systems.test_sys!.wear).toBe(2);
    const done = endDay(s, c, { dinner: 'cook' });
    expect(done.systems.test_sys!.wear).toBe(5);
  });

  it('day.* keys read dayFacts, 0 without it', () => {
    expect(buildConditionContext(makeState(), base)).toMatchObject({ 'day.motor_hours': 0, 'day.sail_hours': 0, 'day.max_wind': 0 });
    const s = makeState({ dayFacts: facts({ motorHours: 1.5, sailHours: 2, maxWindKn: 17 }) });
    expect(buildConditionContext(s, base)).toMatchObject({ 'day.motor_hours': 1.5, 'day.sail_hours': 2, 'day.max_wind': 17 });
  });
});
