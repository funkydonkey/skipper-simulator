import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { newGame } from '../../src/engine/setup';
import { seedHash } from '../../src/engine/seed';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const bundled = loaded.content;

describe('seedHash', () => {
  it('is deterministic and sensitive to every part', () => {
    expect(seedHash(1, 'a')).toBe(seedHash(1, 'a'));
    expect(seedHash(1, 'a')).not.toBe(seedHash(2, 'a'));
    expect(seedHash(1, 'a')).not.toBe(seedHash(1, 'b'));
  });

  it('returns an unsigned 32-bit integer', () => {
    for (let i = 0; i < 200; i++) {
      const h = seedHash(i, 'weather', 'x');
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(2 ** 32);
    }
  });
});

describe('seedHash distribution', () => {
  it('keys differing in one trailing digit spread over both parities', () => {
    const parities = new Set(Array.from({ length: 10 }, (_, d) => seedHash(7, 'crew', d) % 2));
    expect(parities.size).toBe(2);
  });

  it('a 2-variant pick does not strictly alternate with day parity', () => {
    const picks = Array.from({ length: 24 }, (_, i) => seedHash(3, 'ev', i + 1) % 2);
    const alternating = picks.every((p, i) => i === 0 || p !== picks[i - 1]);
    expect(alternating).toBe(false);
    expect(new Set(picks.filter((_, i) => i % 2 === 0)).size, 'odd days alone take both variants').toBe(2);
  });
});

describe('newGame template choice', () => {
  it('uses all 4 bundled templates over seeds 1..200 and leaves rng === seed', () => {
    const used = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const s = newGame(bundled, { seed, lang: 'en' });
      used.add(s.weatherTemplateId);
      expect(s.rng).toBe(seed);
    }
    expect([...used].sort()).toEqual(['calm_then_front', 'meltemi_week', 'sirocco_week', 'variable_week']);
  });

  it('an explicit weatherTemplateId wins', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(newGame(bundled, { seed, lang: 'en', weatherTemplateId: 'sirocco_week' }).weatherTemplateId).toBe('sirocco_week');
    }
  });
});
