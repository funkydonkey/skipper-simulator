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
    expect(e.trigger).toEqual({ phase: 'evening', conditions: ['moored_berth'], chance: 0.3 });
    expect(e.options.map((o) => o.id)).toEqual(['apologize', 'talk_it_over', 'ignore']);
    expect(e.options[1]!.check).toEqual({ voice: 'diplomat', difficulty: 2 });
    expect(e.voices.map((v) => v.voice)).toEqual(expect.arrayContaining(['diplomat', 'pride']));
  });

  it('marinero_tip has the specified trigger and options', () => {
    const e = content.events.find((x) => x.id === 'marinero_tip')!;
    expect(e.pillar).toBe('time');
    expect(e.trigger).toEqual({ phase: 'arrival', conditions: ['at_marina', 'hour >= 14'], chance: 0.35 });
    expect(e.options.map((o) => o.id)).toEqual(['tip', 'chat', 'nothing']);
    expect(e.options[1]!.check).toEqual({ voice: 'diplomat', difficulty: 2 });
    expect(e.voices.map((v) => v.voice)).toEqual(expect.arrayContaining(['diplomat', 'pride']));
  });
});
