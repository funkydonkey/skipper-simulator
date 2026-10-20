import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { formatBatch, runBatch } from '../../src/sim/batch';
import { newbie } from '../../src/sim/strategies';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;
const stats = runBatch(content, newbie, [1, 2, 3, 4, 5]);

describe('runBatch', () => {
  it('counts the weeks', () => expect(stats.weeks).toBe(5));
  it('event rates are fractions of weeks', () => {
    expect(Object.keys(stats.eventRate).sort()).toEqual(content.events.map((e) => e.id).sort());
    for (const r of Object.values(stats.eventRate)) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
  it('zeroFire lists exactly the events with rate 0', () => {
    expect(stats.zeroFire.sort()).toEqual(Object.entries(stats.eventRate).filter(([, r]) => r === 0).map(([id]) => id).sort());
  });
  it('formatBatch mentions every event id with its rate', () => {
    const md = formatBatch(stats, 'newbie');
    for (const e of content.events) expect(md).toContain(e.id);
    expect(md).toContain('newbie');
  });
  it('is deterministic', () => expect(runBatch(content, newbie, [1, 2])).toEqual(runBatch(content, newbie, [1, 2])));
});
