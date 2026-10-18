import { describe, expect, it } from 'vitest';
import { buildDebrief, depositLoss, findLinks, gradeWeek } from '../../src/engine/debrief';
import { appendLog } from '../../src/engine/log';
import type { DebriefRule, GameState } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const boat = content.boats[0]!;
const t = (s: string) => ({ ru: s, en: s });

function withLog(causes: Array<[GameState['log'][number]['kind'], string]>, over: Partial<GameState> = {}): GameState {
  return causes.reduce((s, [kind, cause]) => appendLog(s, { kind, cause }), makeState(over));
}

describe('debrief', () => {
  it('depositLoss uses costs with default fallback', () => {
    expect(depositLoss(['sail_torn', 'mystery'], b)).toBe(900 + 300);
  });

  it('gradeWeek: four scales', () => {
    const clean = makeState({ returnedOnTime: true, resources: { ...makeState().resources, mood: 75 } });
    expect(gradeWeek(clean, boat, b)).toEqual({ scales: { safety: 'good', crew: 'good', boat: 'good', schedule: 'good' }, depositLossEur: 0, depositReturnedEur: 2000 });
    const rough = withLog([['effect', 'maneuver:dep_test:gear_before_release']], { damages: ['toilet_broken'], resources: { ...makeState().resources, mood: 50 } });
    expect(gradeWeek(rough, boat, b).scales).toEqual({ safety: 'ok', crew: 'ok', boat: 'ok', schedule: 'bad' });
    const bad = makeState({ injuries: 1, damages: ['sail_torn', 'hull_scratch'], resources: { ...makeState().resources, mood: 20 } });
    expect(gradeWeek(bad, boat, b)).toMatchObject({ scales: { safety: 'bad', crew: 'bad', boat: 'bad' }, depositLossEur: 1500, depositReturnedEur: 500 });
  });

  const rules: DebriefRule[] = [
    { id: 'low', pillar: 'time', decision: 'plan:route:busy', consequence: 'marina:refused', priority: 1, text: t('busy') },
    { id: 'high', pillar: 'boat', decision: 'checkin:skip:toilets', consequence: 'event:toilet_clog', signal: 'signal:smell', priority: 5, text: t('toilets') },
    { id: 'never', pillar: 'weather', decision: 'barometer:ignored', consequence: 'sail:break', priority: 9, text: t('never') },
  ];

  it('findLinks: ordered by priority, consequence after decision, optional signal', () => {
    const s = withLog([
      ['decision', 'checkin:skip:toilets'], ['decision', 'plan:route:busy'], ['signal', 'signal:smell'],
      ['effect', 'marina:refused'], ['event', 'event:toilet_clog'], ['decision', 'barometer:ignored'],
    ]);
    const links = findLinks(s.log, rules, 5);
    expect(links.map((l) => l.ruleId)).toEqual(['high', 'low']);
    expect(links[0]!.signal!.cause).toBe('signal:smell');
    expect(links[1]!.signal).toBeNull();
  });

  it('findLinks ignores consequences that happened before the decision', () => {
    const s = withLog([['effect', 'marina:refused'], ['decision', 'plan:route:busy']]);
    expect(findLinks(s.log, rules, 5)).toEqual([]);
  });

  it('buildDebrief adds event notes not already covered, capped', () => {
    const s = withLog([['decision', 'checkin:skip:toilets'], ['event', 'event:toilet_clog']], { firedEvents: ['toilet_clog'], returnedOnTime: true });
    const d = buildDebrief(s, content);
    expect(d.links.map((l) => l.ruleId)).toEqual(['toilet_unchecked']);
    expect(d.eventNotes).toEqual([]);
    const s2 = withLog([['event', 'event:toilet_clog']], { firedEvents: ['toilet_clog'] });
    expect(buildDebrief(s2, content).eventNotes).toEqual([content.events[0]!.debrief]);
  });
});
