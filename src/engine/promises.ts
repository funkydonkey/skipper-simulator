import { EngineError } from './errors';
import { appendLog } from './log';
import { requireDialogue, round1 } from './state';
import type { Balance, Content, DayFacts, Dialogue, DialogueContext, Expectation, GameState, Outcome } from './types';

export function createExpectation(d: Dialogue, context: DialogueContext, createdDay: number): Expectation | null {
  if (d.expectation.kind === 'none') return null;
  return {
    id: `${d.id}@${createdDay}`,
    dialogueId: d.id,
    spec: d.expectation,
    strength: d.strength,
    createdDay,
    dueDay: context === 'morning' ? createdDay : createdDay + 1,
    status: 'open',
  };
}

export function judgeExpectation(e: Expectation, f: DayFacts): 'kept' | 'broken' {
  switch (e.spec.kind) {
    case 'depart_by':
      return f.departureHour !== null && f.departureHour <= e.spec.hour ? 'kept' : 'broken';
    case 'arrive_at_kind':
      return f.arrivalPointKind === e.spec.pointKind ? 'kept' : 'broken';
    case 'activity':
      return f.activities.includes(e.spec.activity) ? 'kept' : 'broken';
  }
}

export function expectationMoodDelta(strength: number, status: 'kept' | 'broken', diplomatLevel: number, sensitivity: number, b: Balance): number {
  const p = b.promises;
  if (status === 'kept') return round1(strength * p.keptPerStrength * sensitivity);
  const softening = Math.max(0, 1 - diplomatLevel * p.diplomatSofteningPerLevel);
  return round1(-strength * p.brokenPerStrength * sensitivity * softening);
}

export function crewSensitivity(state: GameState, content: Content): number {
  if (state.crew.length === 0) return 1;
  const total = state.crew.reduce((sum, m) => sum + (content.crew.find((a) => a.id === m.archetypeId)?.promiseSensitivity ?? 1), 0);
  return total / state.crew.length;
}

export function resolveDueExpectations(
  exps: readonly Expectation[],
  facts: DayFacts,
  diplomatLevel: number,
  sensitivity: number,
  b: Balance,
): { expectations: Expectation[]; outcomes: Outcome[]; softened: Array<{ mood: number }> } {
  const outcomes: Outcome[] = [];
  const softened: Array<{ mood: number }> = [];
  const expectations = exps.map((e) => {
    if (e.status !== 'open' || e.dueDay !== facts.day) return e;
    const status = judgeExpectation(e, facts);
    const mood = expectationMoodDelta(e.strength, status, diplomatLevel, sensitivity, b);
    outcomes.push({ cause: `promise:${e.dialogueId}:${status}`, pillar: 'promises', effect: { mood } });
    const spared = round1(mood - expectationMoodDelta(e.strength, status, 0, sensitivity, b));
    if (status === 'broken' && spared > 0) softened.push({ mood: spared });
    return { ...e, status };
  });
  return { expectations, outcomes, softened };
}

export function sayDialogue(state: GameState, content: Content, dialogueId: string, context: DialogueContext): GameState {
  const d = requireDialogue(content, dialogueId);
  if (!d.contexts.includes(context)) throw new EngineError('INVALID_INPUT', `Dialogue ${d.id} cannot be said during ${context}`);
  const s = appendLog(state, { kind: 'decision', cause: `dialogue:${d.id}`, pillar: 'promises', data: { strength: d.strength } });
  const e = createExpectation(d, context, state.day);
  if (!e) return s;
  // Said again for the same day: the newer words replace the open expectation, so it is judged once.
  const same = (x: Expectation): boolean => x.status === 'open' && x.dialogueId === e.dialogueId && x.dueDay === e.dueDay;
  return { ...s, expectations: [...s.expectations.filter((x) => !same(x)), e] };
}
