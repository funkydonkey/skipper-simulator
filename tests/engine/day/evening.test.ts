import { describe, expect, it } from 'vitest';
import { endDay, finishWeek } from '../../../src/engine/day/evening';
import { createExpectation } from '../../../src/engine/promises';
import type { DayFacts, GameState } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, shower: 'normal', ...over,
});
const evening = (over: Partial<GameState> = {}) => deepFreeze(makeState({ phase: 'evening', locationId: 'marina_b', dayFacts: facts(), ...over }));
const causes = (s: GameState) => s.log.map((e) => e.cause);
const res = makeState().resources;

describe('endDay', () => {
  it('at a marina: refill, shore power, night consumption, next morning', () => {
    const s = endDay(evening({ resources: { ...res, waterL: 100, serviceBankPct: 40 } }), content, { dinner: 'cook' });
    expect(s).toMatchObject({ phase: 'morning', day: 2, clockMin: 8 * 60, weather: null, dayFacts: null });
    expect(s.resources.waterL).toBe(200);
    expect(s.resources.serviceBankPct).toBe(100);
    expect(s.resources.gasPct).toBe(91);
    expect(causes(s)).toEqual(expect.arrayContaining(['refill:water', 'consumption:water', 'charge:shore', 'consumption:gas', 'night:sleep']));
  });

  it('at anchor: no refill; exposed bay gives a rolly night', () => {
    const s = endDay(evening({ locationId: 'bay_a', dayFacts: facts({ mooring: 'anchor', arrivalPointKind: 'bay' }) }), content, { dinner: 'cook' });
    expect(causes(s)).not.toContain('refill:water');
    expect(causes(s)).toContain('night:rolly');
    expect(causes(s)).toContain('consumption:electric');
  });

  it('broken promise hurts more than a kept one helps', () => {
    const early = createExpectation(content.dialogues[0]!, 'briefing', 0)!;
    const kept = endDay(evening({ expectations: [early], dayFacts: facts({ departureHour: 8 }) }), content, { dinner: 'cook' });
    const broken = endDay(evening({ expectations: [early], dayFacts: facts({ departureHour: 10 }) }), content, { dinner: 'cook' });
    expect(kept.log.find((e) => e.cause === 'promise:early_try:kept')!.delta!.mood).toBe(4.5);
    expect(broken.log.find((e) => e.cause === 'promise:early_try:broken')!.delta!.mood).toBe(-10.8);
    expect(broken.expectations[0]!.status).toBe('broken');
  });

  it('taverna dinner costs money, lifts mood and keeps a taverna promise', () => {
    const promise = createExpectation(content.dialogues.find((d) => d.id === 'promise_taverna')!, 'evening', 0)!;
    const s = endDay(evening({ expectations: [promise] }), content, { dinner: 'taverna' });
    expect(s.log.find((e) => e.cause === 'activity:taverna')!.delta).toMatchObject({ moneyEur: -140 });
    expect(causes(s)).toContain('promise:promise_taverna:kept');
    expect(() => endDay(evening({ locationId: 'bay_a' }), content, { dinner: 'taverna' })).toThrow(/No taverna at bay_a/);
  });

  it('no gas → no hot food', () => {
    const s = endDay(evening({ resources: { ...res, gasPct: 5 } }), content, { dinner: 'cook' });
    expect(causes(s)).toContain('zero:gas');
    expect(causes(s)).not.toContain('consumption:gas');
  });

  it('mood_per_day applies every night and resets at a berth', () => {
    const atAnchor = endDay(evening({ locationId: 'bay_a', moodPerDay: -8, dayFacts: facts({ mooring: 'anchor' }) }), content, { dinner: 'cook' });
    expect(atAnchor.moodPerDay).toBe(-8);
    expect(causes(atAnchor)).toContain('mood_per_day');
    expect(endDay(evening({ moodPerDay: -8 }), content, { dinner: 'cook' }).moodPerDay).toBe(0);
  });

  it('evening line creates an expectation for tomorrow', () => {
    const s = endDay(evening(), content, { dinner: 'cook', dialogueId: 'promise_taverna' });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'promise_taverna', dueDay: 2 })]);
  });

  it('after the last day → return phase', () => {
    expect(endDay(evening({ day: 6, dayFacts: facts({ day: 6 }) }), content, { dinner: 'cook' }).phase).toBe('return');
  });

  it('guards (Review Focus #5)', () => {
    expect(() => endDay(evening({ eventQueue: ['toilet_clog'] }), content, { dinner: 'cook' })).toThrow(/Resolve event/);
    expect(() => endDay(makeState(), content, { dinner: 'cook' })).toThrow(/Expected phase evening/);
    expect(() => endDay(evening({ dayFacts: null }), content, { dinner: 'cook' })).toThrow(/planDay/);
  });
});

describe('finishWeek', () => {
  it('late return pays a fee; unrecorded old damage is charged', () => {
    const s = finishWeek(deepFreeze(makeState({ phase: 'return', day: 7, returnedOnTime: false, flags: { 'defect.old_scratch': true } })), content);
    expect(s.phase).toBe('debrief');
    expect(s.resources.moneyEur).toBe(1100);
    expect(s.damages).toContain('hull_scratch');
    expect(causes(s)).toEqual(expect.arrayContaining(['return:late_fee', 'deposit:unrecorded:old_scratch']));
  });

  it('on time with photos taken: nothing charged', () => {
    const s = finishWeek(makeState({ phase: 'return', returnedOnTime: true, flags: { 'defect.old_scratch.found': true } }), content);
    expect(s.resources.moneyEur).toBe(1500);
    expect(s.damages).toEqual([]);
  });
});
