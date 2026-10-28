import { describe, expect, it } from 'vitest';
import { buildConditionContext, CONTEXT_KEYS, conditionIdentifiers, evaluateAll, evaluateCondition, parseCondition } from '../../src/engine/expr';
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

  it('step.<id> holds for the steps of today\'s latest maneuver that were not too late', () => {
    const content = makeContent();
    const order = (day: number, cause: string, steps: string[], late?: string[]) => ({ day, clockMin: 600, kind: 'decision' as const, cause, data: late ? { steps, late } : { steps } as Record<string, string[]> });
    const s = makeState({ day: 2, log: [order(1, 'order:ok:x', ['cleat_stern']), order(2, 'order:ok:dep', ['brief_roles']), order(2, 'order:wrong:moor', ['stern_lines_ashore', 'fenders_ready', 'pick_mooring'], ['fenders_ready'])] });
    const c = buildConditionContext(s, content);
    expect(c['step.stern_lines_ashore']).toBe(true);
    expect(c['step.pick_mooring']).toBe(true);
    expect(c['step.fenders_ready']).toBeUndefined();
    expect(c['step.brief_roles']).toBeUndefined();
    expect(c['step.cleat_stern']).toBeUndefined();
    expect(evaluateCondition('!step.fenders_ready', c)).toBe(true);
    expect(buildConditionContext(makeState({ day: 2, log: [order(2, 'order:ok:old', ['brief_bow'])] }), content)['step.brief_bow']).toBe(true);
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

  it('at_marina is false when anchored outside after a refusal; moored_berth tells berth from anchor', () => {
    const content = makeContent();
    const facts = { day: 1, departureHour: 9, arrivalHour: 16, arrivalPointKind: 'bay' as const, mooring: 'anchor' as const, activities: [], motorHours: 1, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal' as const };
    const refused = buildConditionContext(makeState({ locationId: 'marina_b', dayFacts: facts }), content);
    expect(refused).toMatchObject({ at_marina: false, moored_berth: false, location_kind: 'marina' });
    const berthed = buildConditionContext(makeState({ locationId: 'marina_b', dayFacts: { ...facts, mooring: 'berth' } }), content);
    expect(berthed).toMatchObject({ at_marina: true, moored_berth: true });
    expect(buildConditionContext(makeState({ locationId: 'marina_b' }), content)).toMatchObject({ at_marina: true, moored_berth: false });
    const morning = buildConditionContext(makeState({ locationId: 'marina_b', anchoredOff: true }), content);
    expect(morning).toMatchObject({ at_marina: false });
    const quay = { ...content, map: content.map.map((p) => (p.id === 'marina_b' ? { ...p, kind: 'quay' as const } : p)) };
    expect(buildConditionContext(makeState({ locationId: 'marina_b' }), quay).at_quay).toBe(true);
    expect(buildConditionContext(makeState({ locationId: 'marina_b', anchoredOff: true }), quay).at_quay).toBe(false);
    expect(CONTEXT_KEYS).toContain('moored_berth');
  });

  it('night, place.seabed and marina.late feed the chance specs', () => {
    const content = makeContent();
    const sunset = content.balance.time.sunsetHour * 60;
    expect(buildConditionContext(makeState({ clockMin: sunset - 1 }), content)).toMatchObject({ night: false, 'place.seabed': 'sand', 'marina.late': false });
    expect(buildConditionContext(makeState({ clockMin: sunset, locationId: 'marina_b' }), content)).toMatchObject({ night: true, 'place.seabed': 'mud' });
    expect(CONTEXT_KEYS).toEqual(expect.arrayContaining(['night', 'place.seabed', 'marina.late']));
    expect(evaluateCondition("place.seabed == 'mud' && !marina.late", buildConditionContext(makeState({ locationId: 'marina_b' }), content))).toBe(true);
  });

  it('wind and gust are the real wind now: afternoon factor and an active front included', () => {
    const content = makeContent();
    const front = { ...makeState().weather!, front: true, frontAddKn: 10 };
    expect(buildConditionContext(makeState({ clockMin: 15 * 60 }), content)).toMatchObject({ wind: 14.4, gust: 21.6 });
    expect(buildConditionContext(makeState({ clockMin: 15 * 60, weather: front }), content)).toMatchObject({ wind: 24.4, gust: 31.6 });
    expect(buildConditionContext(makeState({ clockMin: 10 * 60, weather: front }), content)).toMatchObject({ wind: 12, gust: 18 });
    expect(buildConditionContext(makeState({ weather: null }), content)).toMatchObject({ wind: 0, gust: 0 });
  });
});
