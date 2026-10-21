import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const weather = loaded.content.weather;

describe('bundled weather templates', () => {
  it('has the 4 expected ids', () => {
    expect(weather.map((t) => t.id).sort()).toEqual(['calm_then_front', 'meltemi_week', 'sirocco_week', 'variable_week']);
  });

  it('every template covers days 1..6', () => {
    for (const t of weather) expect(t.days.map((d) => d.day).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('has at least 6 distinct day directions across templates', () => {
    const dirs = new Set(weather.flatMap((t) => t.days.map((d) => d.dir)));
    expect(dirs.size).toBeGreaterThanOrEqual(6);
  });
});
