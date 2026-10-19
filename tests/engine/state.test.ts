import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { advanceClock, clamp, otherEnd, requireBoat, requirePoint, requireRoute, round1 } from '../../src/engine/state';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

describe('state helpers', () => {
  const content = makeContent();

  it('require* find by id or throw NOT_FOUND', () => {
    expect(requireBoat(content, makeState()).id).toBe('test_boat');
    expect(requirePoint(content, 'bay_a').kind).toBe('bay');
    expect(() => requireRoute(content, 'nope')).toThrow(EngineError);
    expect(() => requireBoat(content, makeState({ boatId: null }))).toThrow(/No boat/);
  });

  it('otherEnd resolves bidirectional routes', () => {
    const r = requireRoute(content, 'r_base_bay_a');
    expect(otherEnd(r, 'base')).toBe('bay_a');
    expect(otherEnd(r, 'bay_a')).toBe('base');
    expect(otherEnd(r, 'marina_b')).toBeNull();
  });

  it('advanceClock rounds minutes and is pure', () => {
    const s = makeState({ clockMin: 600 });
    expect(advanceClock(s, 30.4).clockMin).toBe(630);
    expect(s.clockMin).toBe(600);
  });

  it('number helpers', () => {
    expect(round1(20.16)).toBe(20.2);
    expect(clamp(150, 0, 100)).toBe(100);
    expect(clamp(-5, 0, 100)).toBe(0);
  });
});
