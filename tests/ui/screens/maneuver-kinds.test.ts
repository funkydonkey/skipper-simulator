import { describe, expect, it } from 'vitest';
import { correctOrder, forecastSituation } from '../../../src/engine';
import { maneuversFor, shuffledStepIds } from '../../../src/ui/screens/maneuvers/kinds';
import { content, gameAt } from '../fixtures';

const leg = (routeId: string) => ({ routeId, mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const });
const plan = (...routeIds: string[]) => ({ departureHour: 9, legs: routeIds.map(leg), swimStops: 0, shower: 'normal' as const, autopilot: false });

describe('maneuver kinds', () => {
  it('base to a bay: departure, then anchoring', () => {
    const game = { ...gameAt('planning'), locationId: 'base_marina' };
    expect(maneuversFor(game, content, plan('r_base_marina_cala_azzurra'), null).map((s) => [s.kind, s.fallback])).toEqual([['departure', false], ['anchoring', false]]);
  });

  it('a bay to a marina: anchor up, mooring, and anchoring as a fallback', () => {
    const game = { ...gameAt('planning'), locationId: 'cala_azzurra' };
    expect(maneuversFor(game, content, plan('r_cala_azzurra_kastri_marina'), null).map((s) => [s.kind, s.fallback])).toEqual([
      ['anchor_up', false], ['mooring', false], ['anchoring', true],
    ]);
  });

  it('anchored off a marina that turned the boat away: anchor up, as the engine runs it', () => {
    const game = { ...gameAt('planning'), locationId: 'kastri_marina', anchoredOff: true };
    expect(maneuversFor(game, content, plan('r_cala_azzurra_kastri_marina'), null)[0]!.kind).toBe('anchor_up');
  });

  it('shuffles deterministically and never starts in the correct order', () => {
    for (const m of content.maneuvers) {
      for (const seed of [1, 2, 3, 42, 99]) {
        const a = shuffledStepIds(correctOrder(m), seed);
        expect(a).toEqual(shuffledStepIds(correctOrder(m), seed));
        expect([...a].sort()).toEqual([...correctOrder(m)].sort());
        if (m.steps.length > 1) expect(a).not.toEqual(correctOrder(m));
      }
    }
  });

  it('follows the forecast situation: its berth picks the maneuver, its keys the steps (R18)', () => {
    const game = { ...gameAt('planning'), locationId: 'cala_azzurra', clockMin: 8 * 60 };
    const sternTo = plan('r_cala_azzurra_nisi_quay');
    const stern = maneuversFor(game, content, sternTo, forecastSituation(game, content, sternTo));
    const mooring = stern.find((s) => s.kind === 'mooring')!;
    expect(mooring.maneuver.id).toBe('mooring_med');
    expect(mooring.steps).toContain('windward_stern_first');
    expect(mooring.steps).toContain('pick_lazy_line_boathook');
    expect(mooring.hint?.id).toBe('windward_stern_first');
    const sideTo = { ...sternTo, berth: 'side_to' as const };
    const side = maneuversFor(game, content, sideTo, forecastSituation(game, content, sideTo));
    expect(side.map((s) => [s.kind, s.maneuver.id])).toEqual([['anchor_up', 'anchor_up_bay'], ['mooring', 'mooring_side_to'], ['anchoring', 'anchoring_bay']]);
  });

  it('a rocky bay forecast adds the holding test; anchor_ashore picks its own maneuver', () => {
    const game = { ...gameAt('planning'), locationId: 'nisi_quay', clockMin: 8 * 60 };
    const toFjord = plan('r_nisi_quay_fjord_bay');
    const toLagoonRoute = content.routes.find((r) => r.from === 'blue_lagoon' || r.to === 'blue_lagoon')!;
    const from = toLagoonRoute.from === 'blue_lagoon' ? toLagoonRoute.to : toLagoonRoute.from;
    const lagoonGame = { ...game, locationId: from };
    const toLagoon = plan(toLagoonRoute.id);
    const anchoring = maneuversFor(lagoonGame, content, toLagoon, forecastSituation(lagoonGame, content, toLagoon)).find((s) => s.kind === 'anchoring')!;
    expect(anchoring.steps).toContain('test_holding_astern');
    const ashore = { ...toFjord, berth: 'anchor_ashore' as const };
    const fjord = maneuversFor(game, content, ashore, forecastSituation(game, content, ashore)).find((s) => s.kind === 'anchoring')!;
    expect(fjord.maneuver.id).toBe('anchor_stern_ashore');
  });
});
