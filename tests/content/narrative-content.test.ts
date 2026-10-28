import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { eventTexts } from '../../src/engine/events';
import { evaluateChance } from '../../src/engine/chance';
import { evaluateAll, type CondContext } from '../../src/engine/expr';
import { eventNote, findLinks } from '../../src/engine/debrief';
import { audibleLines } from '../../src/engine/voices';
import { PILLARS, VOICES, type VoiceId } from '../../src/engine/types';

const CAUSE_ROOTS = ['voices', 'boat', 'checkin', 'defect', 'briefing', 'dialogue', 'barometer', 'signal', 'plan', 'order', 'leg', 'weather', 'engine', 'zero', 'consumption', 'sail', 'injury', 'maneuver', 'anchor', 'marina', 'activity', 'rest', 'fatigue', 'event', 'choice', 'promise', 'charge', 'refill', 'mood_per_day', 'night', 'return', 'deposit'];

const { content, errors } = await loadContentDir('content');

describe('narrative content', () => {

  it('whole content directory validates', () => {
    expect(errors).toEqual([]);
  });

  it('25–34 events, at least 3 per pillar (ТЗ 7.2)', () => {
    const events = content!.events;
    expect(events.length).toBeGreaterThanOrEqual(25);
    expect(events.length).toBeLessThanOrEqual(34);
    for (const p of PILLARS) expect(events.filter((e) => e.pillar === p).length, p).toBeGreaterThanOrEqual(3);
  });

  it('every event has a voice line and a real translation', () => {
    for (const e of content!.events) {
      expect(e.voices.length, e.id).toBeGreaterThanOrEqual(1);
      for (const v of eventTexts(e)) expect(v.ru, e.id).not.toBe(v.en);
    }
  });

  it('dialogues match the ТЗ 4.7 table', () => {
    const d = (id: string) => content!.dialogues.find((x) => x.id === id)!;
    expect([d('early_try').strength, d('ten_bonus').strength, d('decide_morning').strength]).toEqual([0.9, 0.6, 0.2]);
    expect(d('promise_taverna').contexts).toContain('evening');
  });

  it('injury rules blame the specific injury cause, not any injury', () => {
    const rule = (id: string) => content!.debrief.find((r) => r.id === id)!;
    expect(rule('injury_loaded_lines').consequence).toBe('injury:event:loaded_sheet');
    expect(rule('injury_cleats').consequence).toBe('injury:event:line_not_cleated');
    expect(rule('injury_reef_underway')).toMatchObject({ pillar: 'safety', priority: 9, decision: 'briefing:skip:loaded_lines', consequence: 'injury:reef_underway' });
    for (const r of content!.debrief) expect(r.consequence, r.id).not.toBe('injury');
  });

  it('debrief rules reference known log cause roots', () => {
    for (const r of content!.debrief) {
      for (const pattern of [r.decision, r.consequence, ...(r.signal ? [r.signal] : [])]) {
        expect(CAUSE_ROOTS, `${r.id}: ${pattern}`).toContain(pattern.split(':')[0]);
      }
    }
  });
});

describe('check-in blame in defect events (QA 2026-10-27)', () => {
  const CASES = [['impeller_overheat', 'impeller'], ['gas_smell', 'gas'], ['toilet_clog', 'toilets'], ['genoa_seam_rip', 'sails'], ['alternator_fault', 'electrics']] as const;
  const ctx = (flags: Record<string, boolean>) => ({ ...flags, 'voice.mechanic': 3 });
  const blames = /не провер|не осмотр|надо было смотреть|not checked|not inspected|should have been checked/i;

  it.each(CASES)('%s blames a skipped check only when %s was skipped', (id, cp) => {
    const ev = content!.events.find((e) => e.id === id)!;
    const notes = (flags: Record<string, boolean>) => {
      const voices = audibleLines(ev.voices, { ...Object.fromEntries(VOICES.map((v) => [v, 4])) } as Record<VoiceId, number>, ctx(flags));
      return [eventNote(ev, ctx(flags)), ...voices.map((l) => l.text)].flatMap((t) => [t.ru, t.en]).join(' | ');
    };
    expect(notes({})).toMatch(blames);
    const sailedOn = notes({ [`checkin.${cp}`]: true, [`checkin.${cp}.sailed_on`]: true });
    expect(sailedOn).not.toMatch(blames);
    expect(eventNote(ev, ctx({ [`checkin.${cp}`]: true, [`checkin.${cp}.sailed_on`]: true }))).not.toEqual(eventNote(ev, ctx({ [`checkin.${cp}`]: true })));
    expect(notes({ [`checkin.${cp}`]: true })).not.toMatch(blames);
  });

  it('the debrief links sailing on with a found defect to its failure, not to a skipped check', () => {
    const log = [
      { day: 0, clockMin: 0, kind: 'decision' as const, cause: 'checkin:check:impeller' },
      { day: 0, clockMin: 0, kind: 'decision' as const, cause: 'checkin:sail_on:worn_impeller' },
      { day: 2, clockMin: 700, kind: 'event' as const, cause: 'event:impeller_overheat' },
    ];
    expect(findLinks(log, content!.debrief, 5).map((l) => l.ruleId)).toEqual(['impeller_sailed_on']);
  });
});

describe('a maneuver step done in time softens the event it touches and the voices explain it (QA 2026-10-27)', () => {
  const CASES = [
    ['fenders_wrong_height', { at_marina: true, at_quay: false }, ['fenders_ready', 'fenders_side']],
    ['line_not_cleated', { at_bay: false }, ['cleat_stern']],
    ['anchor_chain_pile', { at_bay: true }, ['brief_bow']],
  ] as const;
  const levels = Object.fromEntries(VOICES.map((v) => [v, 4])) as Record<VoiceId, number>;

  it.each(CASES)('%s', (id, ctx, steps) => {
    const ev = content!.events.find((e) => e.id === id)!;
    const odds = (c: CondContext) => evaluateChance(ev.trigger.chance, c).value;
    const said = (c: CondContext) => audibleLines(ev.voices, levels, c).map((l) => l.text.ru).join(' ');
    for (const st of steps) {
      const done = { ...ctx, [`step.${st}`]: true };
      expect(evaluateAll(ev.trigger.conditions, done), st).toBe(true);
      expect(odds(done), st).toBeLessThan(odds(ctx) * 0.5);
      expect(said(done), st).toMatch(/вовремя|дали/);
      expect(said(ctx), st).not.toMatch(/вовремя|дали, но/);
    }
  });
});
