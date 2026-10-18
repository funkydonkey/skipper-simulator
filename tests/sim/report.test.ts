import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { formatWeek } from '../../src/sim/report';
import { runWeek } from '../../src/sim/run';
import { newbie } from '../../src/sim/strategies';

const { content } = await loadContentDir('content');

describe('formatWeek', () => {
  it('prints days, scales and links in the chosen language', () => {
    const r = runWeek(content!, 3, newbie);
    const ru = formatWeek(r, content!, 'ru');
    expect(ru).toMatch(/День 1/);
    expect(ru).toMatch(/Безопасность: (good|ok|bad)/);
    expect(formatWeek(r, content!, 'en')).toMatch(/Day 1/);
  });
});
