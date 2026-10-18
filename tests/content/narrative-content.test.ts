import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { PILLARS } from '../../src/engine/types';

const CAUSE_ROOTS = ['voices', 'boat', 'checkin', 'defect', 'briefing', 'dialogue', 'barometer', 'signal', 'plan', 'order', 'leg', 'weather', 'engine', 'zero', 'consumption', 'sail', 'injury', 'maneuver', 'anchor', 'marina', 'activity', 'rest', 'fatigue', 'event', 'choice', 'promise', 'charge', 'refill', 'mood_per_day', 'night', 'return', 'deposit'];

const { content, errors } = await loadContentDir('content');

describe('narrative content', () => {

  it('whole content directory validates', () => {
    expect(errors).toEqual([]);
  });

  it('25–30 events, at least 3 per pillar (ТЗ 7.2)', () => {
    const events = content!.events;
    expect(events.length).toBeGreaterThanOrEqual(25);
    expect(events.length).toBeLessThanOrEqual(30);
    for (const p of PILLARS) expect(events.filter((e) => e.pillar === p).length, p).toBeGreaterThanOrEqual(3);
  });

  it('every event has a voice line and a real translation', () => {
    for (const e of content!.events) {
      expect(e.voices.length, e.id).toBeGreaterThanOrEqual(1);
      expect(e.text.ru, e.id).not.toBe(e.text.en);
    }
  });

  it('dialogues match the ТЗ 4.7 table', () => {
    const d = (id: string) => content!.dialogues.find((x) => x.id === id)!;
    expect([d('early_try').strength, d('ten_bonus').strength, d('decide_morning').strength]).toEqual([0.9, 0.6, 0.2]);
    expect(d('promise_taverna').contexts).toContain('evening');
  });

  it('debrief rules reference known log cause roots', () => {
    for (const r of content!.debrief) {
      for (const pattern of [r.decision, r.consequence, ...(r.signal ? [r.signal] : [])]) {
        expect(CAUSE_ROOTS, `${r.id}: ${pattern}`).toContain(pattern.split(':')[0]);
      }
    }
  });
});
