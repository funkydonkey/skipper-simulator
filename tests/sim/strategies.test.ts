import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { runBatch } from '../../src/sim/batch';
import { runWeek } from '../../src/sim/run';
import { expert, makeStrategy, newbie } from '../../src/sim/strategies';
import type { DayFacts } from '../../src/engine/types';
import { forecastSituation } from '../../src/engine/preview';
import { maneuversFor } from '../../src/ui/screens/maneuvers/kinds';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const realContent = loaded.content;
const facts: DayFacts = {
  day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal',
};

describe('strategies', () => {
  it('choose the taverna only while it is open', () => {
    const open = makeState({ phase: 'evening', locationId: 'marina_b', dayFacts: facts, clockMin: 18 * 60 });
    const closed = { ...open, clockMin: content.balance.time.tavernaCloseHour * 60 };
    expect(newbie.evening(open, content).dinner).toBe('taverna');
    expect(newbie.evening(closed, content).dinner).toBe('cook');
    expect(expert.evening(closed, content).dinner).toBe('cook');
  });
});

describe('makeStrategy', () => {
  it('careful and ignore-weakness take the requested boat', () => {
    expect(makeStrategy('careful', 'calypso_38').boatId).toBe('calypso_38');
    expect(makeStrategy('ignore-weakness', 'aurora_45').boatId).toBe('aurora_45');
  });
  it('newbie and expert keep their boats and have no-op hooks', () => {
    expect(makeStrategy('newbie').boatId).toBe('aurora_45');
    expect(makeStrategy('expert').boatId).toBe('meltemi_40');
    expect(expert.fixDefects(['x'], makeState(), content)).toEqual([]);
    expect(newbie.repair([], makeState())).toBeNull();
  });
});

describe('weakness strategies on the real content', () => {
  const real = realContent;
  const checked = (name: 'careful' | 'ignore-weakness', boat: string) =>
    runWeek(real, 1, makeStrategy(name, boat)).state.log.filter((e) => e.cause.startsWith('checkin:check:')).map((e) => e.cause.slice('checkin:check:'.length));
  it('ignore-weakness on Meltemi never checks sails; careful does', () => {
    expect(checked('ignore-weakness', 'meltemi_40')).not.toContain('sails');
    expect(checked('careful', 'meltemi_40')).toContain('sails');
  });
  it.each(['aurora_45', 'meltemi_40', 'calypso_38'])('both play a full week on %s and finish at base on day 6', (boat) => {
    for (const name of ['careful', 'ignore-weakness'] as const) {
      const r = runWeek(real, 2, makeStrategy(name, boat));
      expect(r.state.phase).toBe('debrief');
      expect(r.state.locationId).toBe('base_marina');
    }
  });
  it('runBatch reports a weaknessRate in [0, 1]', () => {
    const stats = runBatch(real, makeStrategy('ignore-weakness', 'meltemi_40'), [1, 2, 3]);
    expect(stats.weaknessRate).toBeGreaterThanOrEqual(0);
    expect(stats.weaknessRate).toBeLessThanOrEqual(1);
  });
});

describe('forecast-follower (R25 measurement)', () => {
  const CONDITIONAL = ['mooring_no_hook', 'leeward_first', 'tight_no_fenders', 'test_before_drop'];
  const judged = (r: ReturnType<typeof runWeek>) =>
    r.state.log.filter((e) => e.kind !== 'roll' && CONDITIONAL.some((id) => e.cause.startsWith('maneuver:') && e.cause.endsWith(`:${id}`)));

  it('orders exactly the maneuver screen pool, in content order, for every kind on the screen', () => {
    const s = makeStrategy('forecast-follower');
    const r = runWeek(realContent, 1, {
      ...s,
      plan: (st, c) => {
        const p = s.plan(st, c);
        if (p.legs.length > 0) {
          for (const spec of maneuversFor(st, c, p, forecastSituation(st, c, p))) expect(p.maneuverOrders?.[spec.kind]).toEqual(spec.steps);
        }
        return p;
      },
    });
    expect(r.state.phase).toBe('debrief');
  });

  it('over 100 weeks makes no judged conditional error', () => {
    const s = makeStrategy('forecast-follower');
    const errors = Array.from({ length: 100 }, (_, i) => judged(runWeek(realContent, i + 1, s))).flat();
    expect(errors.map((e) => e.cause)).toEqual([]);
  });
});
