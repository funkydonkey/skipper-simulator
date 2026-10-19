import { describe, expect, it } from 'vitest';
import { buildDebrief, depositLoss, findLinks, gradeWeek } from '../../src/engine/debrief';
import { appendLog } from '../../src/engine/log';
import type { DebriefRule, GameState, LogEntry } from '../../src/engine/types';
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

  const at = (day: number, kind: LogEntry['kind'], cause: string): LogEntry => ({ day, clockMin: 600, kind, cause });
  const rule = (id: string, pillar: DebriefRule['pillar'], priority: number, decision: string, consequence: string, signal?: string): DebriefRule =>
    ({ id, pillar, priority, decision, consequence, ...(signal ? { signal } : {}), text: t(id) });

  it('findLinks takes the latest matching decision before the consequence', () => {
    const log = [at(1, 'decision', 'dialogue:early_try'), at(2, 'decision', 'dialogue:early_try'), at(2, 'effect', 'promise:early_try:broken')];
    const [link] = findLinks(log, [rule('p', 'promises', 1, 'dialogue:early_try', 'promise:early_try:broken')], 5);
    expect(link!.decision).toBe(log[1]);
  });

  it('findLinks: plan/barometer/order decisions and signal:* must be on the consequence day', () => {
    const r = [rule('busy', 'time', 1, 'plan:route:busy', 'marina:refused', 'signal:front')];
    expect(findLinks([at(1, 'decision', 'plan:route:busy'), at(2, 'effect', 'marina:refused')], r, 5)).toEqual([]);
    const log = [at(1, 'signal', 'signal:front'), at(1, 'decision', 'plan:route:busy'), at(2, 'decision', 'plan:route:busy'), at(2, 'effect', 'marina:refused')];
    const [link] = findLinks(log, r, 5);
    expect(link!.decision).toBe(log[2]);
    expect(link!.signal).toBeNull();
    const barometer = [rule('b', 'weather', 1, 'barometer:ignored', 'sail:break')];
    expect(findLinks([at(1, 'decision', 'barometer:ignored'), at(2, 'effect', 'sail:break')], barometer, 5)).toEqual([]);
    const briefing = [rule('i', 'safety', 1, 'briefing:skip:cleats', 'injury:event:line_not_cleated')];
    expect(findLinks([at(0, 'decision', 'briefing:skip:cleats'), at(4, 'effect', 'injury:event:line_not_cleated:grab_line:fail')], briefing, 5)).toHaveLength(1);
  });

  it('findLinks: a log entry is the consequence of at most one link', () => {
    const r = [rule('a', 'time', 5, 'plan:route:busy', 'marina:refused'), rule('b', 'time', 3, 'plan:depart:late', 'marina:refused')];
    const one = [at(1, 'decision', 'plan:route:busy'), at(1, 'decision', 'plan:depart:late'), at(1, 'effect', 'marina:refused')];
    expect(findLinks(one, r, 5).map((l) => l.ruleId)).toEqual(['a']);
    const two = [...one, at(2, 'decision', 'plan:route:busy'), at(2, 'decision', 'plan:depart:late'), at(2, 'effect', 'marina:refused')];
    const links = findLinks(two, r, 5);
    expect(links.map((l) => l.ruleId)).toEqual(['a', 'b']);
    expect(links[0]!.consequence).toBe(two[2]);
    expect(links[1]!.consequence).toBe(two[5]);
  });

  it('findLinks spreads across pillars first, then fills by priority, capped', () => {
    const r = [
      rule('s10', 'safety', 10, 'briefing:skip:a', 'x:a'), rule('s9', 'safety', 9, 'briefing:skip:b', 'x:b'),
      rule('s8', 'safety', 8, 'briefing:skip:c', 'x:c'), rule('boat1', 'boat', 1, 'checkin:skip:d', 'x:d'),
    ];
    const log = ['a', 'b', 'c', 'd'].flatMap((k) => [at(1, 'decision', `${k === 'd' ? 'checkin' : 'briefing'}:skip:${k}`), at(1, 'effect', `x:${k}`)]);
    expect(findLinks(log, r, 2).map((l) => l.ruleId)).toEqual(['s10', 'boat1']);
    expect(findLinks(log, r, 5).map((l) => l.ruleId)).toEqual(['s10', 'boat1', 's9', 's8']);
  });

  it('buildDebrief caps event notes by maxItems minus links', () => {
    const events = ['e1', 'e2', 'e3'].map((id) => ({ ...content.events[0]!, id, debrief: t(id) }));
    const c = { ...content, events };
    const s = makeState({ firedEvents: ['e1', 'e2', 'e3'] });
    expect(buildDebrief(s, c, 2).eventNotes).toEqual([t('e1'), t('e2')]);
    const linked = withLog([['decision', 'checkin:skip:toilets'], ['event', 'event:toilet_clog']], { firedEvents: ['e1', 'e2', 'e3'] });
    const d = buildDebrief(linked, c, 2);
    expect(d.links).toHaveLength(1);
    expect(d.eventNotes).toEqual([t('e1')]);
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
