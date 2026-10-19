import { describe, expect, it } from 'vitest';
import { correctOrder } from '../../../src/engine';
import { maneuversFor, shuffledStepIds } from '../../../src/ui/screens/maneuvers/kinds';
import { content, gameAt } from '../fixtures';

const leg = (routeId: string) => ({ routeId, mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const });
const plan = (...routeIds: string[]) => ({ departureHour: 9, legs: routeIds.map(leg), swimStops: 0, shower: 'normal' as const, autopilot: false });

describe('maneuver kinds', () => {
  it('base to a bay: departure, then anchoring', () => {
    const game = { ...gameAt('planning'), locationId: 'base_marina' };
    expect(maneuversFor(game, content, plan('r_base_marina_cala_azzurra')).map((s) => [s.kind, s.fallback])).toEqual([['departure', false], ['anchoring', false]]);
  });

  it('a bay to a marina: anchor up, mooring, and anchoring as a fallback', () => {
    const game = { ...gameAt('planning'), locationId: 'cala_azzurra' };
    expect(maneuversFor(game, content, plan('r_cala_azzurra_kastri_marina')).map((s) => [s.kind, s.fallback])).toEqual([
      ['anchor_up', false], ['mooring', false], ['anchoring', true],
    ]);
  });

  it('shuffles deterministically and never starts in the correct order', () => {
    for (const m of content.maneuvers) {
      for (const seed of [1, 2, 3, 42, 99]) {
        const a = shuffledStepIds(m, seed);
        expect(a).toEqual(shuffledStepIds(m, seed));
        expect([...a].sort()).toEqual([...correctOrder(m)].sort());
        if (m.steps.length > 1) expect(a).not.toEqual(correctOrder(m));
      }
    }
  });
});
