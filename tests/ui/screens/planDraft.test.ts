import { describe, expect, it } from 'vitest';
import { addLeg, departureOptions, initialDraft, reachableFrom, removeLastLeg, toDayPlan, trailOf, updateLeg } from '../../../src/ui/screens/planning/planDraft';
import { content, gameAt } from '../fixtures';

describe('planDraft', () => {
  const game = { ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 };

  it('offers half-hour departures from now until sunset', () => {
    const opts = departureOptions({ ...game, clockMin: 11 * 60 + 10 }, content);
    expect(opts[0]).toBe(11.5);
    expect(opts.at(-1)).toBeLessThan(content.balance.time.sunsetHour);
    expect(departureOptions({ ...game, clockMin: content.balance.time.sunsetHour * 60 }, content)).toEqual([]);
  });

  it('chains legs from the current point and lists the next reachable points', () => {
    let d = initialDraft(game, content);
    expect(reachableFrom(content, game, d)).toContain('cala_azzurra');
    d = addLeg(content, game, d, 'cala_azzurra');
    d = addLeg(content, game, d, 'kastri_marina');
    expect(trailOf(content, game.locationId, d.legs)).toEqual(['base_marina', 'cala_azzurra', 'kastri_marina']);
    expect(addLeg(content, game, d, 'blue_lagoon')).toBe(d);
    expect(removeLastLeg(d).legs).toHaveLength(1);
  });

  it('edits a leg immutably and builds a DayPlan', () => {
    const d = addLeg(content, game, initialDraft(game, content), 'cala_azzurra');
    const sail = updateLeg(d, 0, { mode: 'sail', reefs: 1 });
    expect(d.legs[0]!.mode).toBe('motor');
    expect(toDayPlan(sail)).toMatchObject({ legs: [{ routeId: 'r_base_marina_cala_azzurra', mode: 'sail', reefs: 1 }], shower: 'normal' });
  });
});
