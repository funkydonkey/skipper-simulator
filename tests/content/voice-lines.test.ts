import { beforeAll, describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { parseCondition } from '../../src/engine/expr';
import type { Content, VoiceLine } from '../../src/engine/types';

let content: Content;
let lines: VoiceLine[];

beforeAll(async () => {
  const r = await loadContentDir('content');
  content = r.content!;
  lines = content.events.flatMap((e) => e.voices);
});

describe('voice content', () => {
  it.each(['sea_sense', 'caution', 'order', 'mechanic', 'diplomat'])('%s has at least 2 lines at level 3-4', (voice) => {
    expect(lines.filter((l) => l.voice === voice && l.min_level >= 3).length).toBeGreaterThanOrEqual(2);
  });

  it('crew_voice has mood-aware lines on both sides', () => {
    const crew = lines.filter((l) => l.voice === 'crew_voice' && l.when);
    expect(crew.length).toBeGreaterThanOrEqual(4);
    expect(crew.filter((l) => /mood\s*<\s*50/.test(l.when!)).length).toBeGreaterThanOrEqual(2);
    expect(crew.filter((l) => /mood\s*>=\s*70/.test(l.when!)).length).toBeGreaterThanOrEqual(2);
  });

  it('economist speaks at least 4 times', () => {
    expect(lines.filter((l) => l.voice === 'economist').length).toBeGreaterThanOrEqual(4);
  });

  it('every `when` parses', () => {
    for (const l of lines) if (l.when) expect(() => parseCondition(l.when!)).not.toThrow();
  });

  it('neighbor_complains has the specified trigger and options', () => {
    const e = content.events.find((x) => x.id === 'neighbor_complains')!;
    expect(e.pillar).toBe('promises');
    expect(e.trigger).toEqual({ phase: 'evening', conditions: ["moored_berth"], chance: 0.3, once: false, cooldownDays: 2, maxPerWeek: 2 });
    expect(e.options.map((o) => o.id)).toEqual(['apologize', 'talk_it_over', 'ignore']);
    expect(e.options[1]!.check).toEqual({ voice: 'diplomat', difficulty: 2 });
    expect(e.voices.map((v) => v.voice)).toEqual(expect.arrayContaining(['diplomat', 'pride']));
  });

  it('marinero_tip has the specified trigger and options', () => {
    const e = content.events.find((x) => x.id === 'marinero_tip')!;
    expect(e.pillar).toBe('time');
    expect(e.trigger).toEqual({ phase: 'arrival', conditions: ['at_marina', 'hour >= 14'], chance: 0.35, once: false, cooldownDays: 2, maxPerWeek: 2 });
    expect(e.options.map((o) => o.id)).toEqual(['tip', 'chat', 'nothing']);
    expect(e.options[1]!.check).toEqual({ voice: 'diplomat', difficulty: 2 });
    expect(e.voices.map((v) => v.voice)).toEqual(expect.arrayContaining(['diplomat', 'pride']));
  });

  it('mood-gated lines are reachable under their event trigger', () => {
    for (const e of content.events) {
      const upper = e.trigger.conditions.map((c) => /^mood\s*<\s*(\d+)$/.exec(c)?.[1]).filter(Boolean).map(Number);
      const lower = e.trigger.conditions.map((c) => /^mood\s*>=?\s*(\d+)$/.exec(c)?.[1]).filter(Boolean).map(Number);
      for (const l of e.voices) {
        const ge = /^mood\s*>=\s*(\d+)$/.exec(l.when ?? '')?.[1];
        const lt = /^mood\s*<\s*(\d+)$/.exec(l.when ?? '')?.[1];
        if (ge) for (const y of upper) expect(y, `${e.id}: ${l.when}`).toBeGreaterThan(Number(ge));
        if (lt) for (const y of lower) expect(y, `${e.id}: ${l.when}`).toBeLessThan(Number(lt));
      }
    }
  });
});
