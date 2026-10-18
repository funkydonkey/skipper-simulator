import { describe, expect, it } from 'vitest';
import { buildConditionContext, conditionIdentifiers, evaluateAll, evaluateCondition, parseCondition } from '../../src/engine/expr';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

describe('expr', () => {
  const ctx = { day: 3, water: 40, location_kind: 'bay', front: true, 'checkin.toilets': true };

  it('compares numbers and strings', () => {
    expect(evaluateCondition('day >= 3', ctx)).toBe(true);
    expect(evaluateCondition('day > 3', ctx)).toBe(false);
    expect(evaluateCondition('water < 50.5', ctx)).toBe(true);
    expect(evaluateCondition("location_kind == 'bay'", ctx)).toBe(true);
    expect(evaluateCondition("location_kind != 'bay'", ctx)).toBe(false);
  });

  it('handles !, &&, ||, parentheses and precedence', () => {
    expect(evaluateCondition('!checkin.toilets', ctx)).toBe(false);
    expect(evaluateCondition('front && day >= 3', ctx)).toBe(true);
    expect(evaluateCondition('day < 2 || front', ctx)).toBe(true);
    expect(evaluateCondition('day < 2 || day > 5 && front', ctx)).toBe(false);
    expect(evaluateCondition('(day < 2 || day > 2) && front', ctx)).toBe(true);
    expect(evaluateCondition('true', ctx)).toBe(true);
  });

  it('missing prefixed flags default to false', () => {
    expect(evaluateCondition('briefing.toilet', ctx)).toBe(false);
    expect(evaluateCondition('!briefing.toilet', ctx)).toBe(true);
    expect(evaluateCondition('defect.worn_impeller', ctx)).toBe(false);
  });

  it('unknown non-prefixed identifiers throw', () => {
    expect(() => evaluateCondition('dya >= 3', ctx)).toThrow(/Unknown identifier "dya"/);
  });

  it('syntax errors throw on parse', () => {
    expect(() => parseCondition('day >= ')).toThrow(/condition/);
    expect(() => parseCondition('(day >= 3')).toThrow(/Missing \)/);
    expect(() => parseCondition('day # 3')).toThrow(/Unexpected/);
    expect(() => evaluateCondition("day >= 'x'", ctx)).toThrow(/needs numbers/);
  });

  it('evaluateAll is AND over the list; empty list is true', () => {
    expect(evaluateAll([], ctx)).toBe(true);
    expect(evaluateAll(['day >= 3', '!checkin.toilets'], ctx)).toBe(false);
  });

  it('conditionIdentifiers lists identifiers', () => {
    expect(conditionIdentifiers('day >= 3 && !briefing.toilet || front').sort()).toEqual(['briefing.toilet', 'day', 'front']);
  });

  it('buildConditionContext exposes resources, flags, damages, wishes, voices, boat', () => {
    const content = makeContent();
    const state = makeState({ flags: { 'checkin.toilets': true }, damages: ['sail_torn'], resources: { ...makeState().resources, waterL: 75 } });
    const c = buildConditionContext(state, content);
    expect(c.day).toBe(1);
    expect(c.water).toBe(75);
    expect(c.water_pct).toBe(25);
    expect(c['checkin.toilets']).toBe(true);
    expect(c['damage.sail_torn']).toBe(true);
    expect(c['wish.taverna']).toBe(true);
    expect(c['wish.rest']).toBeUndefined();
    expect(c['voice.mechanic']).toBe(2);
    expect(c.at_base).toBe(true);
    expect(c.location_kind).toBe('base');
    expect(c['boat.shared_bank']).toBe(false);
    expect(c.wind).toBe(12);
    expect(c.front).toBe(false);
  });
});
