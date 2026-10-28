import { describe, expect, it } from 'vitest';
import { endDay } from '../../../src/engine/day/evening';
import { planDay, validatePlan } from '../../../src/engine/day/passage';
import { previewPlan } from '../../../src/engine/preview';
import { berthFee } from '../../../src/engine/berths';
import type { DayPlan, LegPlan } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const sail = (routeId: string, over: Partial<LegPlan> = {}): LegPlan => ({ routeId, mode: 'sail', reefs: 0, genoa: 'full', course: 'direct', ...over });
const plan = (over: Partial<DayPlan> = {}): DayPlan => ({ departureHour: 9, legs: [sail('r_base_bay_a')], swimStops: 0, shower: 'normal', autopilot: false, ...over });
const causes = (s: { log: { cause: string }[] }) => s.log.map((e) => e.cause);
const quiet = { ...content, events: [] };

describe('planDay', () => {
  it('sails to a bay, anchors, fills dayFacts, queues to evening', () => {
    const s = planDay(deepFreeze(makeState()), content, plan());
    expect(s.phase).toBe('evening');
    expect(s.locationId).toBe('bay_a');
    expect(s.dayFacts).toMatchObject({ day: 1, departureHour: 9, arrivalPointKind: 'bay', mooring: 'anchor', motorHours: 0.5, sailHours: 2.44, autopilotHours: 0, shower: 'normal' });
    expect(s.clockMin).toBeGreaterThan(11 * 60 + 50);
    expect(causes(s)).toEqual(expect.arrayContaining([
      'plan:shower:normal', 'plan:depart:early', 'plan:route:easy', 'plan:mode:sail', 'plan:reefs:0',
      'engine:start', 'order:ok:dep_test', 'leg:r_base_bay_a', 'order:ok:anchoring_test', 'fatigue:passage',
    ]));
    expect(causes(s)).not.toContain('rest');
    expect(causes(s).some((c) => c.startsWith('anchor:attempts:'))).toBe(true);
  });

  it('motor leg burns fuel', () => {
    const s = planDay(makeState(), content, plan({ legs: [sail('r_base_bay_a', { mode: 'motor' })] }));
    expect(s.resources.fuelL).toBe(143.1);
    expect(s.dayFacts!.motorHours).toBe(2.04);
  });

  it('fuel runs out mid-day: clamp to 0, log, next motor leg sails (Review Focus #3)', () => {
    const start = makeState({ resources: { ...makeState().resources, fuelL: 2 } });
    const s = planDay(start, content, plan({ legs: [sail('r_base_bay_a', { mode: 'motor' }), sail('r_bay_a_marina_b', { mode: 'motor' })] }));
    expect(s.resources.fuelL).toBe(0);
    expect(Number.isNaN(s.resources.fuelL)).toBe(false);
    expect(causes(s)).toContain('zero:fuel');
    const legs = s.log.filter((e) => e.cause.startsWith('leg:'));
    expect(legs.map((e) => e.data!.mode)).toEqual(['motor', 'sail']);
  });

  it('dead starter: jump start costs money and time', () => {
    const start = makeState({ resources: { ...makeState().resources, starterBankPct: 10 } });
    const s = planDay(start, content, plan());
    expect(causes(s)).toContain('zero:starter');
    expect(s.resources.moneyEur).toBeLessThanOrEqual(1500 - 120);
    expect(s.dayFacts!.departureHour).toBe(12);
  });

  it('busy route ending at base on the last day → on time (judged at endDay)', () => {
    const p = planDay(makeState({ day: 6 }), quiet, plan({
      departureHour: 6,
      legs: [sail('r_base_bay_a'), sail('r_bay_a_marina_b'), sail('r_marina_b_base')],
    }));
    expect(causes(p)).toContain('plan:route:busy');
    expect(p.dayFacts!.mooring).toBe('berth');
    expect(p.returnedOnTime).toBeNull();
    const s = endDay(p, quiet, { dinner: 'cook' });
    expect(s.returnedOnTime).toBe(true);
    expect(causes(s)).toContain('return:on_time');
  });

  it('last day not at base → late', () => {
    const s = endDay(planDay(makeState({ day: 6 }), quiet, plan()), quiet, { dinner: 'cook' });
    expect(s.returnedOnTime).toBe(false);
    expect(causes(s)).toContain('return:late');
  });

  it('staying in place: no engine, only evening events, rest counted', () => {
    const s = planDay(makeState(), content, plan({ legs: [], swimStops: 1 }));
    expect(s.locationId).toBe('base');
    expect(causes(s)).not.toContain('engine:start');
    expect(causes(s)).toContain('activity:swim');
    expect(s.dayFacts).toMatchObject({ departureHour: null, arrivalPointKind: null, activities: ['swim'] });
  });

  it('after a night anchored off a marina: staying put is a night at anchor, leaving weighs anchor', () => {
    const off = makeState({ locationId: 'marina_b', anchoredOff: true });
    const stay = planDay(off, quiet, plan({ legs: [] }));
    expect(stay.dayFacts!.mooring).toBe('anchor');
    const night = causes(endDay(stay, quiet, { dinner: 'cook' }));
    expect(night).not.toContain('charge:shore');
    expect(night).not.toContain('refill:water');
    const leave = causes(planDay(off, quiet, plan({ legs: [sail('r_marina_b_base')] })));
    expect(leave).toContain('order:ok:anchor_up_test');
    expect(leave).not.toContain('order:ok:dep_test');
  });

  it('another night at a paid berth charges its fee again; short of money, the boat anchors off', () => {
    const marina = content.map.find((p) => p.id === 'marina_b')!;
    const fee = berthFee(marina, marina.berths[0]!.type, 2, content.balance)!;
    const stay = planDay(makeState({ locationId: 'marina_b' }), quiet, plan({ legs: [] }));
    expect(stay.resources.moneyEur).toBe(1500 - fee.eur);
    expect(stay.log.find((e) => e.cause === 'marina:fee')).toMatchObject({ pillar: 'boat', delta: { moneyEur: -fee.eur } });
    expect(causes(stay)).toContain('voice:economist:saved');
    expect(stay.dayFacts!.mooring).toBe('berth');
    expect(planDay(makeState(), quiet, plan({ legs: [] })).resources.moneyEur).toBe(1500);
    expect(causes(planDay(makeState({ locationId: 'marina_b', anchoredOff: true }), quiet, plan({ legs: [] })))).not.toContain('marina:fee');
    const broke = planDay(makeState({ locationId: 'marina_b', resources: { ...makeState().resources, moneyEur: 10 } }), quiet, plan({ legs: [] }));
    expect(causes(broke)).toContain('marina:no_money');
    expect(broke.resources.moneyEur).toBe(10);
    expect(broke.dayFacts!.mooring).toBe('anchor');
    expect(causes(endDay(broke, quiet, { dinner: 'cook' }))).not.toContain('charge:shore');
  });

  it('endDay remembers a night anchored off a marina that turned the boat away, until it berths', () => {
    const broke = makeState({ locationId: 'bay_a', resources: { ...makeState().resources, moneyEur: 10 } });
    const refused = planDay(broke, quiet, plan({ legs: [sail('r_bay_a_marina_b')] }));
    expect(causes(refused)).toContain('marina:no_money');
    const next = endDay(refused, quiet, { dinner: 'cook' });
    expect(next.anchoredOff).toBe(true);
    const planning = { ...next, phase: 'planning' as const, weather: makeState().weather };
    expect(endDay(planDay(planning, quiet, plan({ legs: [] })), quiet, { dinner: 'cook' }).anchoredOff).toBe(true);
    const berthed = endDay(planDay({ ...planning, anchoredOff: false, resources: makeState().resources }, quiet, plan({ legs: [] })), quiet, { dinner: 'cook' });
    expect(berthed.anchoredOff).toBe(false);
    expect(endDay(planDay(makeState(), quiet, plan()), quiet, { dinner: 'cook' }).anchoredOff).toBe(false);
  });

  it('swim stops starting at or after sunset are skipped and do not count as swimming', () => {
    const dusk = planDay(makeState({ clockMin: 19.5 * 60 }), content, plan({ legs: [], swimStops: 2 }));
    expect(causes(dusk).filter((c) => c === 'activity:swim')).toHaveLength(1);
    expect(causes(dusk)).toContain('activity:swim_skipped');
    expect(dusk.dayFacts!.activities).toContain('swim');
    const dark = planDay(makeState({ clockMin: 20 * 60 }), content, plan({ legs: [], swimStops: 2 }));
    expect(causes(dark)).not.toContain('activity:swim');
    expect(causes(dark).filter((c) => c === 'activity:swim_skipped')).toHaveLength(2);
    expect(dark.clockMin).toBe(20 * 60);
    expect(dark.dayFacts!.activities).not.toContain('swim');
  });

  it('arriving after sunset costs fatigue and mood', () => {
    const s = planDay(makeState(), content, plan({ departureHour: 19 }));
    const night = s.log.find((e) => e.cause === 'night:arrival')!;
    expect(night).toMatchObject({ kind: 'effect', pillar: 'time', delta: { fatigue: content.balance.fatigue.nightArrival, mood: -content.balance.mood.nightArrival } });
    expect(causes(planDay(makeState(), content, plan()))).not.toContain('night:arrival');
  });

  it('wrong maneuver order is logged and costs fatigue', () => {
    const s = planDay(makeState(), content, plan({ maneuverOrders: { departure: ['release_lines', 'neutral', 'command_helm', 'engage_gear'] } }));
    expect(causes(s)).toEqual(expect.arrayContaining(['order:wrong:dep_test', 'maneuver:dep_test:release_before_neutral', 'fatigue:maneuver:dep_test']));
    expect(s.damages).toContain('prop_line');
  });

  it('invalid plans throw and leave state untouched (Review Focus #2)', () => {
    const s = deepFreeze(makeState());
    const snapshot = JSON.stringify(s);
    expect(() => planDay(s, content, plan({ legs: [sail('r_nowhere')] }))).toThrow(/unknown route "r_nowhere"/);
    expect(() => planDay(s, content, plan({ legs: [sail('r_bay_a_marina_b')] }))).toThrow(/does not start at base/);
    expect(() => planDay(s, content, plan({ departureHour: 3 }))).toThrow(/departureHour/);
    expect(() => planDay(s, content, plan({ departureHour: content.balance.time.sunsetHour }))).toThrow(/departureHour/);
    expect(() => planDay(s, content, plan({ swimStops: 9 }))).toThrow(/swimStops/);
    expect(() => planDay(s, content, plan({ maneuverOrders: { departure: ['neutral', 'neutral'] } }))).toThrow(/duplicate steps/);
    expect(() => planDay(s, content, plan({ legs: [], maneuverOrders: { mooring: ['a', 'zzz'] } }))).toThrow(/unknown step "zzz"/);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('wrong phase or pending event (Review Focus #5)', () => {
    expect(() => planDay(makeState({ phase: 'morning' }), content, plan())).toThrow(/Expected phase planning/);
    expect(() => planDay(makeState({ eventQueue: ['toilet_clog'] }), content, plan())).toThrow(/Resolve event toilet_clog/);
  });

  it('rejects a sailing plan when the effective departure is already past sunset', () => {
    const content = makeContent();
    const late = makeState({ clockMin: 20 * 60 + 10 });
    const leg = { routeId: 'r_base_bay_a', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
    expect(() => validatePlan(late, content, { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false }))
      .toThrow(/past sunset/);
    expect(() => validatePlan(late, content, { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false }))
      .not.toThrow();
  });

  it('rejects a plan the preview expects to arrive after time.latestArrivalHour, with its own error code', () => {
    const t = content.balance.time;
    const long = plan({ departureHour: 19, legs: [sail('r_base_bay_a'), sail('r_bay_a_marina_b'), sail('r_marina_b_base')] });
    const s = makeState();
    expect(previewPlan(s, content, long).arrivalMin!).toBeGreaterThan(t.latestArrivalHour * 60);
    expect(previewPlan(s, content, long).arrivalTooLate).toBe(true);
    expect(() => validatePlan(s, content, long)).toThrow(expect.objectContaining({ code: 'TOO_LATE' }));
    expect(() => planDay(s, content, long)).toThrow(/latestArrivalHour/);
    expect(previewPlan(s, content, plan()).arrivalTooLate).toBe(false);
    expect(() => validatePlan(s, content, plan())).not.toThrow();
  });

  it('rejects maneuver orders for an unknown maneuver kind', () => {
    const content = makeContent();
    const orders = { docking: ['a', 'b'] } as unknown as Record<string, string[]>;
    expect(() => validatePlan(makeState(), content, { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false, maneuverOrders: orders }))
      .toThrow(/Unknown maneuver kind "docking"/);
  });
});
