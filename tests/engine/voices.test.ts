import { describe, expect, it } from 'vitest';
import { audibleLines, cautionTimeFactor, checkChance, initialVoices, maneuverRiskFactor, resourceReadout, rollCheck, validateAllocation } from '../../src/engine/voices';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const b = makeContent().balance;
const valid = { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 };

describe('voices', () => {
  it('allocation: 12 points across 6 trainable voices, 0..4 each', () => {
    expect(validateAllocation(valid, b)).toEqual([]);
    expect(validateAllocation({ ...valid, economist: 1 }, b)).toContainEqual(expect.stringMatching(/sum must be 12/));
    expect(validateAllocation({ ...valid, sea_sense: 5, economist: -1 }, b)).toContainEqual(expect.stringMatching(/sea_sense.*0\.\.4/));
    expect(validateAllocation({ ...valid, pride: 1, economist: 1 }, b)).toContainEqual(expect.stringMatching(/pride.*not trainable/));
    expect(validateAllocation({ ...valid, mechanic: 1.5, diplomat: 2.5 }, b)).toContainEqual(expect.stringMatching(/integer/));
  });

  it('initialVoices fills fixed voices and throws on invalid input', () => {
    expect(initialVoices({ sea_sense: 4, mechanic: 4, order: 4 }, b)).toEqual({
      sea_sense: 4, caution: 0, order: 4, mechanic: 4, diplomat: 0, economist: 0, pride: 2, crew_voice: 2,
    });
    expect(() => initialVoices({ sea_sense: 4 }, b)).toThrow(/sum must be 12/);
  });

  it('checkChance: level vs difficulty, fatigue, clamped', () => {
    expect(checkChance(2, 2, 0, b)).toBeCloseTo(0.5);
    expect(checkChance(4, 2, 0, b)).toBeCloseTo(0.8);
    expect(checkChance(1, 2, 0, b)).toBeCloseTo(0.35);
    expect(checkChance(4, 0, 0, b)).toBe(0.95);
    expect(checkChance(2, 2, 50, b)).toBeCloseTo(0.3);
    expect(checkChance(0, 4, 100, b)).toBe(0.05);
  });

  it('rollCheck is deterministic and reports chance', () => {
    expect(rollCheck(9, 2, 2, 0, b)).toEqual(rollCheck(9, 2, 2, 0, b));
    expect(rollCheck(9, 2, 2, 0, b).value.chance).toBeCloseTo(0.5);
  });

  it('audibleLines filters by voice level', () => {
    const lines = [
      { voice: 'mechanic' as const, min_level: 2, text: { ru: 'a', en: 'a' } },
      { voice: 'sea_sense' as const, min_level: 3, text: { ru: 'b', en: 'b' } },
      { voice: 'pride' as const, min_level: 1, text: { ru: 'c', en: 'c' } },
    ];
    expect(audibleLines(lines, makeState().voices).map((l) => l.text.ru)).toEqual(['a', 'c']);
  });

  it('resourceReadout: mechanic sees exact numbers', () => {
    expect(resourceReadout(37.4, '%', 25, 2, b)).toBe('37%');
    expect(resourceReadout(37.4, '%', 25, 1, b)).toBe('~25%');
    expect(resourceReadout(180, ' L', 50, 0, b)).toBe('~200 L');
  });

  it('risk and time factors from caution/order', () => {
    expect(maneuverRiskFactor({ ...makeState().voices, caution: 0, order: 0 }, b)).toBe(1);
    expect(maneuverRiskFactor({ ...makeState().voices, caution: 4, order: 4 }, b)).toBeCloseTo(0.408);
    expect(cautionTimeFactor(4, b)).toBeCloseTo(1.2);
  });
});
