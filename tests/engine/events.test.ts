import { describe, expect, it } from 'vitest';
import { buildConditionContext } from '../../src/engine/expr';
import { eligibleEvents, pillarWeight, presentEvent, queueEvent, resolveOption, resolvePendingEvent, rollEvent } from '../../src/engine/events';
import type { Content, GameEvent } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const clog = content.events[0]!;
const day3 = makeState({ day: 3, phase: 'evening' });
const forced = (over: Partial<GameEvent> = {}): Content => ({
  ...content,
  events: [{ ...clog, trigger: { ...clog.trigger, chance: 1 }, ...over }],
});

describe('events', () => {
  it('pillarWeight reads the drama template', () => {
    expect(pillarWeight(3, 'weather', b)).toBe(1.5);
    expect(pillarWeight(3, 'boat', b)).toBe(1);
  });

  it('eligibleEvents: phase, conditions, once', () => {
    const ctx = buildConditionContext(day3, content);
    expect(eligibleEvents(content, day3, 'evening', ctx).map((e) => e.id)).toEqual(['toilet_clog']);
    expect(eligibleEvents(content, day3, 'morning', ctx)).toEqual([]);
    const checked = makeState({ day: 3, flags: { 'checkin.toilets': true } });
    expect(eligibleEvents(content, checked, 'evening', buildConditionContext(checked, content))).toEqual([]);
    const fired = makeState({ day: 3, firedEvents: ['toilet_clog'] });
    expect(eligibleEvents(content, fired, 'evening', buildConditionContext(fired, content))).toEqual([]);
  });

  it('rollEvent fires about chance × weight of the time', () => {
    const ctx = buildConditionContext(day3, content);
    let s = 1;
    let hits = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollEvent(s, content, day3, 'evening', ctx);
      if (r.value) hits++;
      s = r.next;
    }
    expect(hits / 2000).toBeGreaterThan(0.31);
    expect(hits / 2000).toBeLessThan(0.39);
  });

  it('resolveOption: check option → success/fail cause; effects option → plain cause', () => {
    const ctx = buildConditionContext(day3, content);
    const r = resolveOption(5, clog, 'fix_self', day3, ctx, b);
    expect(r.value.check!.odds.value).toBeCloseTo(0.46);
    expect(r.value.outcomes[0]!.cause).toMatch(/^event:toilet_clog:fix_self:(success|fail)$/);
    const c = resolveOption(5, clog, 'call_base', day3, ctx, b);
    expect(c.value).toEqual({ outcomes: [{ cause: 'event:toilet_clog:call_base', pillar: 'boat', effect: { money: -80, time_hours: 4 } }], check: null });
    expect(c.next).toBe(5);
  });

  it('resolveOption rejects unknown and unavailable options', () => {
    const ev: GameEvent = { ...clog, options: [...clog.options, { id: 'bay_only', text: { ru: 'x', en: 'x' }, requires: ['at_bay'], effects: { mood: 1 } }] };
    const ctx = buildConditionContext(day3, content);
    expect(() => resolveOption(1, ev, 'nope', day3, ctx, b)).toThrow(/not found/);
    expect(() => resolveOption(1, ev, 'bay_only', day3, ctx, b)).toThrow(/not available/);
  });

  it('presentEvent localises text, filters voices, shows check chances', () => {
    const view = presentEvent(clog, day3, buildConditionContext(day3, content), content);
    expect(view.text).toBe((clog.text as { ru: string }).ru);
    expect(view.voices).toEqual([{ voice: 'mechanic', text: 'Клапан забит. Это час работы и перчатки.' }]);
    expect(view.options.map((o) => [o.id, o.available, o.chance === null ? null : Math.round(o.chance.value * 100)])).toEqual([
      ['fix_self', true, 46], ['call_base', true, null], ['endure', true, null],
    ]);
  });

  it('queueEvent + resolvePendingEvent', () => {
    const c = forced();
    const queued = queueEvent(deepFreeze(day3), c, 'evening');
    expect(queued.eventQueue).toEqual(['toilet_clog']);
    expect(queued.firedEvents).toEqual(['toilet_clog']);
    expect(queued.log.at(-1)).toMatchObject({ kind: 'event', cause: 'event:toilet_clog', pillar: 'boat' });
    const done = resolvePendingEvent(deepFreeze(queued), c, 'call_base');
    expect(done.eventQueue).toEqual([]);
    expect(done.resources.moneyEur).toBe(1420);
    expect(done.log.map((e) => e.cause).slice(-2)).toEqual(['choice:toilet_clog:call_base', 'event:toilet_clog:call_base']);
    expect(() => resolvePendingEvent(done, c, 'call_base')).toThrow(/No pending event/);
  });

  it('effect.promise creates an expectation', () => {
    const c = forced({ options: [{ id: 'promise', text: { ru: 'да', en: 'yes' }, effects: { promise: 'promise_taverna', mood: 4 } }, ...clog.options] });
    const s = resolvePendingEvent(queueEvent(day3, c, 'evening'), c, 'promise');
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'promise_taverna', dueDay: 4 })]);
    expect(s.log.some((e) => e.cause === 'dialogue:promise_taverna')).toBe(true);
  });
});
