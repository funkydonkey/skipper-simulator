import { describe, expect, it } from 'vitest';
import { endDay } from '../../src/engine/day/evening';
import { planDay } from '../../src/engine/day/passage';
import { buildConditionContext } from '../../src/engine/expr';
import { eligibleEvents, eventText, presentEvent, resolvePendingEvent } from '../../src/engine/events';
import type { Content, DayPlan, GameEvent, GameState, LegPlan, LogEntry } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const clog = content.events[0]!;
const t = (ru: string, en: string) => ({ ru, en });
const ev = (id: string, trigger: Partial<GameEvent['trigger']>, over: Partial<GameEvent> = {}): GameEvent => ({
  ...clog, id, trigger: { phase: 'evening', conditions: [], chance: 1, ...trigger }, ...over,
});
const withEvents = (events: GameEvent[]): Content => ({ ...content, events });
const fired = (id: string, ...days: number[]): LogEntry[] => days.map((day) => ({ kind: 'event', cause: `event:${id}`, day, clockMin: 0 }));
const ids = (c: Content, s: GameState, phase: 'evening' | 'passage' = 'evening'): string[] =>
  eligibleEvents(c, s, phase, buildConditionContext(s, c)).map((e) => e.id);
const sail = (routeId: string): LegPlan => ({ routeId, mode: 'sail', reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[]): DayPlan => ({ departureHour: 6, legs, swimStops: 0, shower: 'normal', autopilot: false });
const threeLegs = [sail('r_base_bay_a'), sail('r_bay_a_marina_b'), sail('r_marina_b_base')];

describe('cooldown and weekly cap come from the log', () => {
  const c = withEvents([ev('rep', { once: false, cooldownDays: 2 })]);
  it('cooldownDays 2: fired day 2 -> blocked day 3, eligible day 4', () => {
    const log = fired('rep', 2);
    expect(ids(c, makeState({ day: 2, log }))).toEqual([]);
    expect(ids(c, makeState({ day: 3, log }))).toEqual([]);
    expect(ids(c, makeState({ day: 4, log }))).toEqual(['rep']);
  });
  it('without a cooldown a repeatable event is always eligible', () => {
    expect(ids(withEvents([ev('rep', { once: false })]), makeState({ day: 3, log: fired('rep', 3) }))).toEqual(['rep']);
  });
  it('maxPerWeek 2 blocks the third firing', () => {
    const m = withEvents([ev('rep', { once: false, maxPerWeek: 2 })]);
    expect(ids(m, makeState({ day: 5, log: fired('rep', 1) }))).toEqual(['rep']);
    expect(ids(m, makeState({ day: 5, log: fired('rep', 1, 3) }))).toEqual([]);
  });
  it('other events and option entries do not count', () => {
    const log: LogEntry[] = [...fired('other', 3), { kind: 'decision', cause: 'event:rep:opt', day: 3, clockMin: 0 }];
    expect(ids(c, makeState({ day: 4, log }))).toEqual(['rep']);
  });
});

describe('per-leg passage events', () => {
  const strait = ev('strait_ev', { phase: 'passage', once: false, conditions: ['leg.feature.strait'] });
  it('a strait on leg 2 of 3 queues the event once, at leg 2 time', () => {
    const c = withEvents([strait]);
    const s = planDay(makeState(), c, plan(threeLegs));
    expect(s.eventQueue).toEqual(['strait_ev']);
    const legs = s.log.filter((e) => e.cause.startsWith('leg:'));
    const entry = s.log.filter((e) => e.cause === 'event:strait_ev');
    expect(entry).toHaveLength(1);
    expect(entry[0]!.clockMin).toBeGreaterThan(legs[1]!.clockMin);
    expect(entry[0]!.clockMin).toBe(legs[2]!.clockMin); // leg 3 starts where leg 2 ends
    expect(s.log.indexOf(entry[0]!)).toBeGreaterThan(s.log.indexOf(legs[1]!));
    expect(s.log.indexOf(entry[0]!)).toBeLessThan(s.log.indexOf(legs[2]!));
  });
  it('leg wind overrides the day wind in the leg context', () => {
    const windy = ev('windy_ev', { phase: 'passage', conditions: ['wind >= 14'] });
    const c = withEvents([windy]);
    // kLocal 1.3 on the strait leg lifts 12 kn to ~15.6; the open leg stays at 12 kn.
    const s = planDay(makeState(), c, plan([sail('r_base_bay_a'), sail('r_bay_a_marina_b')]));
    const e = s.log.find((x) => x.cause === 'event:windy_ev')!;
    const legs = s.log.filter((x) => x.cause.startsWith('leg:'));
    expect(s.log.indexOf(e)).toBeGreaterThan(s.log.indexOf(legs[1]!));
  });
  it('2 passage events + an evening event resolve in order; the day is blocked meanwhile', () => {
    const c = withEvents([
      ev('strait_ev', { phase: 'passage', conditions: ['leg.feature.strait'] }),
      ev('gulf_ev', { phase: 'passage', conditions: ['leg.feature.gulf'] }),
      ev('eve_ev', { phase: 'evening' }),
    ]);
    let s = planDay(makeState(), c, plan(threeLegs));
    expect(s.eventQueue).toEqual(['strait_ev', 'gulf_ev', 'eve_ev']);
    expect(() => endDay(s, c, {} as never)).toThrow(/Resolve event strait_ev/);
    expect(() => planDay(s, c, plan([]))).toThrow();
    s = resolvePendingEvent(s, c, 'call_base');
    expect(s.eventQueue).toEqual(['gulf_ev', 'eve_ev']);
    s = resolvePendingEvent(s, c, 'call_base');
    s = resolvePendingEvent(s, c, 'call_base');
    expect(s.eventQueue).toEqual([]);
  });
  it('planDay no longer rolls a generic passage phase at day end', () => {
    // Two chance-1 passage events, one leg: the leg roll takes the first. A leftover day-end roll would
    // queue the second one too (queued events are not eligible again, so a single event could not show it).
    const c = withEvents([ev('pass_a', { phase: 'passage', once: false }), ev('pass_b', { phase: 'passage', once: false })]);
    expect(planDay(makeState(), c, plan([sail('r_base_bay_a')])).eventQueue).toEqual(['pass_a']);
  });

  it('queueFailureEvent: a failure-named event queues once per moving day, after leg events, before arrival and evening', () => {
    const failing: Content = {
      ...content,
      systems: [...content.systems, {
        id: 'test_sys', name: t('Тест', 'Test'), wearPer: {}, brokenEffect: {}, repairs: [],
        failures: [{ id: 'f', phase: 'passage', chance: 1, event: 'fail_ev' }],
      }],
      events: [
        ev('fail_ev', { phase: 'passage', chance: 0 }),
        ev('leg_ev', { phase: 'passage', once: false, conditions: ['leg.feature.strait'] }),
        ev('arr_ev', { phase: 'arrival' }),
        ev('eve_ev', { phase: 'evening' }),
      ],
    };
    const on = makeState({ systems: { ...makeState().systems, test_sys: { state: 'ok', wear: 0, broken: false } } });
    const moving = planDay(on, failing, plan(threeLegs));
    expect(moving.eventQueue).toEqual(['leg_ev', 'fail_ev', 'arr_ev', 'eve_ev']);
    const still = planDay(on, failing, plan([]));
    expect(still.eventQueue).toEqual(['eve_ev']);
  });
});

describe('text variants', () => {
  const variants = ev('var', {}, { text: [t('а', 'a'), t('б', 'b'), t('в', 'c')] });
  it('a plain text is returned as is', () => {
    expect(eventText(clog, makeState())).toBe(clog.text);
  });
  it('the same seed and day give the same variant', () => {
    const s = makeState({ day: 3 });
    const later = { ...s, rng: 999 };
    expect(eventText(variants, s)).toBe(eventText(variants, later));
    expect(presentEvent(variants, s, buildConditionContext(s, content), content).text).toBe(eventText(variants, s).ru);
  });
  it('over 6 days at least 2 variants appear', () => {
    const seen = new Set([1, 2, 3, 4, 5, 6].map((day) => eventText(variants, makeState({ day })).en));
    expect(seen.size).toBeGreaterThanOrEqual(2);
  });
});
