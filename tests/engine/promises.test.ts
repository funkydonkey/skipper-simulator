import { describe, expect, it } from 'vitest';
import { createExpectation, crewSensitivity, duePromises, expectationMoodDelta, judgeExpectation, resolveDueExpectations, sayDialogue } from '../../src/engine/promises';
import { deepFreeze } from '../fixtures/freeze';
import type { DayFacts } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const dlg = (id: string) => content.dialogues.find((d) => d.id === id)!;
const facts = (over: Partial<DayFacts> = {}): DayFacts => ({
  day: 1, departureHour: 8, arrivalHour: 14, arrivalPointKind: 'bay', mooring: 'anchor', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal', ...over,
});

describe('promises', () => {
  it('createExpectation: what the crew heard, due next day unless said in the morning', () => {
    expect(createExpectation(dlg('early_try'), 'briefing', 0)).toEqual({
      id: 'early_try@0', dialogueId: 'early_try', spec: { kind: 'depart_by', hour: 8 }, strength: 0.9, createdDay: 0, dueDay: 1, status: 'open',
    });
    expect(createExpectation(dlg('early_try'), 'morning', 3)!.dueDay).toBe(3);
    expect(createExpectation(dlg('decide_morning'), 'evening', 2)).toBeNull();
  });

  it('judgeExpectation by kind', () => {
    const early = createExpectation(dlg('early_try'), 'briefing', 0)!;
    expect(judgeExpectation(early, facts({ departureHour: 8 }))).toBe('kept');
    expect(judgeExpectation(early, facts({ departureHour: 9.5 }))).toBe('broken');
    expect(judgeExpectation(early, facts({ departureHour: null }))).toBe('broken');
    const taverna = createExpectation(dlg('promise_taverna'), 'evening', 0)!;
    expect(judgeExpectation(taverna, facts({ activities: ['taverna'] }))).toBe('kept');
    expect(judgeExpectation(taverna, facts())).toBe('broken');
  });

  it('asymmetric mood: kept +s×5, broken −s×15, diplomat softens, sensitivity scales', () => {
    expect(expectationMoodDelta(0.9, 'kept', 0, 1, b)).toBe(4.5);
    expect(expectationMoodDelta(0.9, 'broken', 0, 1, b)).toBe(-13.5);
    expect(expectationMoodDelta(0.9, 'broken', 2, 1, b)).toBe(-10.8);
    expect(expectationMoodDelta(0.9, 'broken', 0, 1.2, b)).toBe(-16.2);
  });

  it('crewSensitivity averages archetypes', () => {
    expect(crewSensitivity(makeState(), content)).toBeCloseTo(1.0);
    expect(crewSensitivity(makeState({ crew: [] }), content)).toBe(1);
  });

  it('resolveDueExpectations only touches open expectations due today', () => {
    const due = createExpectation(dlg('early_try'), 'briefing', 0)!;
    const later = createExpectation(dlg('ten_bonus'), 'evening', 1)!;
    const r = resolveDueExpectations([due, later], facts({ day: 1, departureHour: 10 }), 0, 1, b);
    expect(r.expectations.map((e) => e.status)).toEqual(['broken', 'open']);
    expect(r.outcomes).toEqual([{ cause: 'promise:early_try:broken', pillar: 'promises', effect: { mood: -13.5 } }]);
  });

  it('sayDialogue logs the line and stores what the crew heard', () => {
    const s = deepFreeze(makeState({ day: 2 }));
    const next = sayDialogue(s, content, 'promise_taverna', 'evening');
    expect(next.expectations).toEqual([expect.objectContaining({ id: 'promise_taverna@2', dueDay: 3, status: 'open' })]);
    expect(next.log.at(-1)).toMatchObject({ kind: 'decision', cause: 'dialogue:promise_taverna', pillar: 'promises' });
    expect(sayDialogue(s, content, 'decide_morning', 'evening').expectations).toEqual([]);
    expect(() => sayDialogue(s, content, 'promise_taverna', 'briefing')).toThrow(/cannot be said during briefing/);
    expect(() => sayDialogue(s, content, 'ghost', 'evening')).toThrow(/not found/);
  });

  it('saying the same line twice logs it twice but keeps one open expectation', () => {
    const once = sayDialogue(makeState({ day: 2 }), content, 'promise_taverna', 'evening');
    const twice = sayDialogue(once, content, 'promise_taverna', 'evening');
    expect(twice.expectations).toHaveLength(1);
    expect(twice.log.filter((e) => e.cause === 'dialogue:promise_taverna')).toHaveLength(2);
  });

  it('repeating a line for the same day (briefing, then that morning) replaces the expectation, not doubles it', () => {
    const briefed = sayDialogue(makeState({ day: 0 }), content, 'early_try', 'briefing');
    const morning = sayDialogue({ ...briefed, day: 1 }, content, 'early_try', 'morning');
    expect(morning.expectations).toEqual([expect.objectContaining({ id: 'early_try@1', dueDay: 1, status: 'open' })]);
    const judged = resolveDueExpectations(morning.expectations, facts({ day: 1, departureHour: 9 }), 0, 1, b);
    expect(judged.outcomes).toHaveLength(1);
    const kept = { ...morning, expectations: judged.expectations };
    expect(sayDialogue({ ...kept, day: 1 }, content, 'early_try', 'evening').expectations).toHaveLength(2);
  });

  it('duePromises judges today\'s open expectations as "Lights out" will, with the chosen dinner', () => {
    const said = sayDialogue(sayDialogue(makeState({ day: 2 }), content, 'promise_taverna', 'evening'), content, 'ten_bonus', 'evening');
    const s = deepFreeze({ ...said, day: 3, dayFacts: facts({ day: 3, departureHour: 9 }) });
    const cook = duePromises(s, content, 'cook');
    expect(cook.map((p) => [p.expectation.dialogueId, p.status])).toEqual([['promise_taverna', 'broken'], ['ten_bonus', 'kept']]);
    const judged = resolveDueExpectations(s.expectations, s.dayFacts!, s.voices.diplomat, crewSensitivity(s, content), b);
    expect(cook.map((p) => p.mood)).toEqual(judged.outcomes.map((o) => o.effect.mood));
    expect(duePromises(s, content, 'taverna').map((p) => p.status)).toEqual(['kept', 'kept']);
    expect(duePromises({ ...s, day: 2, dayFacts: facts({ day: 2 }) }, content, 'cook')).toEqual([]);
    expect(duePromises({ ...s, dayFacts: null }, content, 'cook')).toEqual([]);
  });
});
