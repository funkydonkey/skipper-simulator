import { describe, expect, it } from 'vitest';
import { chance, nextFloat, nextInt, nextRange, pickWeighted } from '../../src/engine/rng';

describe('rng', () => {
  it('is deterministic for the same state', () => {
    expect(nextFloat(42)).toEqual(nextFloat(42));
    expect(nextFloat(42).value).not.toEqual(nextFloat(43).value);
  });

  it('returns floats in [0, 1) and advances state', () => {
    let s = 1;
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      expect(r.next).not.toBe(s);
      s = r.next;
    }
  });

  it('nextRange and nextInt stay in bounds', () => {
    let s = 7;
    for (let i = 0; i < 500; i++) {
      const a = nextRange(s, 8, 12);
      expect(a.value).toBeGreaterThanOrEqual(8);
      expect(a.value).toBeLessThan(12);
      const b = nextInt(a.next, 1, 3);
      expect([1, 2, 3]).toContain(b.value);
      s = b.next;
    }
  });

  it('chance(p) hits about p of the time and always consumes one draw', () => {
    let s = 99;
    let hits = 0;
    for (let i = 0; i < 4000; i++) {
      const r = chance(s, 0.3);
      expect(r.next).toBe(nextFloat(s).next);
      if (r.value) hits++;
      s = r.next;
    }
    expect(hits / 4000).toBeGreaterThan(0.27);
    expect(hits / 4000).toBeLessThan(0.33);
    expect(chance(5, 0).value).toBe(false);
    expect(chance(5, 1).value).toBe(true);
  });

  it('pickWeighted respects weights and returns null for empty/zero weights', () => {
    expect(pickWeighted(1, []).value).toBeNull();
    expect(pickWeighted(1, [{ item: 'a', weight: 0 }]).value).toBeNull();
    let s = 3;
    let a = 0;
    for (let i = 0; i < 2000; i++) {
      const r = pickWeighted(s, [{ item: 'a', weight: 3 }, { item: 'b', weight: 1 }]);
      if (r.value === 'a') a++;
      s = r.next;
    }
    expect(a / 2000).toBeGreaterThan(0.7);
    expect(a / 2000).toBeLessThan(0.8);
  });
});
