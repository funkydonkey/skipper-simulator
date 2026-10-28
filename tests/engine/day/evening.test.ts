import { describe, expect, it } from 'vitest';
import { endDay, finishWeek } from '../../../src/engine/day/evening';
import { resolvePendingEvent } from '../../../src/engine/events';
import { createExpectation } from '../../../src/engine/promises';
import { repairSystem } from '../../../src/engine/repair';
import type { DayFacts, GameState } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal', ...over,
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

  it('a diplomat softens a broken promise and endDay logs how much', () => {
    const early = createExpectation(content.dialogues[0]!, 'briefing', 0)!;
    const late = facts({ departureHour: 10 });
    const plain = endDay(evening({ expectations: [early], dayFacts: late, voices: { ...makeState().voices, diplomat: 0 } }), content, { dinner: 'cook' });
    const soft = endDay(evening({ expectations: [early], dayFacts: late, voices: { ...makeState().voices, diplomat: 2 } }), content, { dinner: 'cook' });
    const hurt = (st: GameState) => st.log.find((e) => e.cause === 'promise:early_try:broken')!.delta!.mood!;
    const spared = Math.round((hurt(soft) - hurt(plain)) * 10) / 10;
    expect(spared).toBeGreaterThan(0);
    expect(soft.log).toContainEqual(expect.objectContaining({ kind: 'info', cause: 'voice:diplomat:softened', pillar: 'promises', data: { mood: spared } }));
    expect(causes(plain)).not.toContain('voice:diplomat:softened');
  });

  it('an economist logs the saving on overnight fuel and gas refills', () => {
    const thrifty = { ...makeState().voices, economist: 2 };
    const full = endDay(evening({ voices: { ...thrifty, economist: 0 }, resources: { ...res, fuelL: 50, gasPct: 10 } }), content, { dinner: 'cook' });
    expect(causes(full)).not.toContain('voice:economist:saved');
    const s = endDay(evening({ voices: thrifty, resources: { ...res, fuelL: 50, gasPct: 10 } }), content, { dinner: 'cook' });
    const saved = s.log.filter((e) => e.cause === 'voice:economist:saved');
    expect(saved.map((e) => e.data?.for)).toEqual(expect.arrayContaining(['refill:fuel', 'refill:gas']));
    for (const e of saved) expect(Number(e.data?.eur)).toBeGreaterThan(0);
  });

  it('taverna dinner costs money, lifts mood and keeps a taverna promise', () => {
    const promise = createExpectation(content.dialogues.find((d) => d.id === 'promise_taverna')!, 'evening', 0)!;
    const s = endDay(evening({ expectations: [promise] }), content, { dinner: 'taverna' });
    expect(s.log.find((e) => e.cause === 'activity:taverna')!.delta).toMatchObject({ moneyEur: -126 });
    expect(causes(s)).toContain('promise:promise_taverna:kept');
    expect(() => endDay(evening({ locationId: 'bay_a' }), content, { dinner: 'taverna' })).toThrow(/No taverna at bay_a/);
  });

  it('the taverna closes at time.tavernaCloseHour', () => {
    const late = evening({ clockMin: content.balance.time.tavernaCloseHour * 60 });
    expect(() => endDay(late, content, { dinner: 'taverna' })).toThrow(/Taverna is closed/);
    expect(endDay(evening({ clockMin: 22 * 60 }), content, { dinner: 'taverna' }).phase).toBe('morning');
  });

  it('a late night recovers less fatigue', () => {
    const tired = { ...res, fatigue: 60 };
    const sleep = (clockMin: number) => endDay(evening({ clockMin, resources: tired }), content, { dinner: 'cook' }).log.find((e) => e.cause === 'night:sleep')!.delta!.fatigue;
    expect(sleep(18 * 60)).toBe(-30);
    expect(sleep(20 * 60)).toBe(-30);
    expect(sleep(26 * 60)).toBe(-15);
  });

  it('a passage event that costs time cuts rest and can make the last-day return late', () => {
    const passageEvent = { ...content.events[0]!, id: 'slow_passage', trigger: { ...content.events[0]!.trigger, phase: 'passage' as const } };
    const c = { ...content, events: [passageEvent] };
    const restMood = (s: GameState) => s.log.find((e) => e.cause === 'rest')!.delta?.mood ?? 0;
    const afternoon = evening({ clockMin: 14 * 60 });
    const delayed = resolvePendingEvent({ ...afternoon, eventQueue: ['slow_passage'] }, c, 'call_base');
    expect(delayed.clockMin).toBe(18 * 60);
    expect(restMood(endDay(afternoon, c, { dinner: 'cook' }))).toBe(5 * content.balance.mood.restPerHour);
    expect(restMood(endDay(delayed, c, { dinner: 'cook' }))).toBe(2 * content.balance.mood.restPerHour);
    const lastDay = evening({ day: 6, clockMin: 14 * 60, locationId: 'base', dayFacts: facts({ day: 6 }) });
    const stayed = endDay(evening({ day: 6, clockMin: 10 * 60, locationId: 'base', dayFacts: facts({ day: 6, arrivalHour: null, arrivalPointKind: 'base' }) }), c, { dinner: 'cook' });
    expect(stayed.returnedOnTime).toBe(true);
    expect(stayed.log.find((e) => e.cause === 'return:on_time')?.data).toBeUndefined();
    expect(endDay(lastDay, c, { dinner: 'cook' }).returnedOnTime).toBe(true);
    const lateDay = resolvePendingEvent({ ...lastDay, eventQueue: ['slow_passage'] }, c, 'call_base');
    const late = endDay(lateDay, c, { dinner: 'cook' });
    expect(late.returnedOnTime).toBe(false);
    expect(causes(late)).toContain('return:late');
  });

  it('the return is judged at mooring: evening events and repairs at base cannot make it late', () => {
    const arrivalEvent = { ...content.events[0]!, id: 'slow_arrival', trigger: { ...content.events[0]!.trigger, phase: 'arrival' as const } };
    const c = { ...content, events: [...content.events, arrivalEvent] };
    const moored = evening({ day: 6, clockMin: 16 * 60, locationId: 'base', dayFacts: facts({ day: 6, arrivalHour: 16 }) });
    const eveningEvent = resolvePendingEvent({ ...moored, eventQueue: ['toilet_clog'] }, c, 'call_base');
    expect(eveningEvent.clockMin).toBe(20 * 60);
    expect(endDay(eveningEvent, c, { dinner: 'cook' }).returnedOnTime).toBe(true);
    const broken = { ...moored, systems: { ...moored.systems, rig: { state: 'worn' as const, wear: 9, broken: true } } };
    const repaired = repairSystem(broken, c, 'rig', 'service');
    expect(repaired.clockMin).toBe(20 * 60);
    expect(endDay(repaired, c, { dinner: 'cook' }).returnedOnTime).toBe(true);
    const queued = resolvePendingEvent({ ...moored, eventQueue: ['slow_arrival'] }, c, 'call_base');
    expect(queued.dayFacts!.arrivalHour).toBe(20);
    expect(endDay(queued, c, { dinner: 'cook' }).returnedOnTime).toBe(false);
  });

  it('time lost late at night never runs the clock past the next morning: capped and logged', () => {
    const morning = (24 + content.balance.start.hour) * 60;
    const lateNight = evening({ clockMin: morning - 60, eventQueue: ['toilet_clog'] });
    const s = resolvePendingEvent(lateNight, content, 'call_base');
    expect(s.clockMin).toBe(morning);
    expect(s.log.find((e) => e.cause === 'night:clock_capped')).toMatchObject({ kind: 'info', pillar: 'time', data: { lostMin: 180 } });
    const early = resolvePendingEvent(evening({ eventQueue: ['toilet_clog'] }), content, 'call_base');
    expect(causes(early)).not.toContain('night:clock_capped');
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
    const s = finishWeek(deepFreeze(makeState({ phase: 'return', day: 7, returnedOnTime: false, flags: { 'defect.old_scratch': true }, defects: ['old_scratch'] })), content);
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
