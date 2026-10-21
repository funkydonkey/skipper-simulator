import { describe, expect, it } from 'vitest';
import { berthFee } from '../../src/engine/berths';
import { arrive } from '../../src/engine/day/arrival';
import { previewPlan } from '../../src/engine/preview';
import { requireBoat } from '../../src/engine/state';
import type { DayPlan, LegPlan } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const base = makeContent();
const content = {
  ...base,
  map: base.map.map((p) => (p.id === 'marina_b' ? { ...p, priceEur: 80, berths: [...p.berths, { type: 'side_to' as const, headingDeg: 0 }] } : p)),
};
const b = content.balance;
const marina = content.map.find((p) => p.id === 'marina_b')!;
const bay = content.map.find((p) => p.id === 'bay_a')!;
const leg: LegPlan = { routeId: 'r_bay_a_marina_b', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' };
const plan: DayPlan = { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false };
const atBayA = (economist: number) => makeState({ locationId: 'bay_a', voices: { ...makeState().voices, economist } });

describe('berthFee', () => {
  it('is null at a free point and charges the side-to factor and the economist discount', () => {
    expect(berthFee(bay, 'anchor', 0, b)).toBeNull();
    expect(berthFee(marina, 'stern_to', 0, b)!.eur).toBe(80);
    expect(berthFee(marina, 'side_to', 0, b)!.eur).toBe(80 * b.berths.sideToPriceFactor);
    expect(berthFee(marina, 'stern_to', 2, b)!.eur).toBe(72);
  });
});

describe('PlanPreview.berthFees', () => {
  it('lists a fee per berth at a priced destination, with side-to dearer, after the discount', () => {
    const fees = previewPlan(atBayA(2), content, plan).berthFees;
    expect(fees).toEqual({ stern_to: berthFee(marina, 'stern_to', 2, b)!.eur, side_to: berthFee(marina, 'side_to', 2, b)!.eur });
    expect(fees.side_to!).toBeGreaterThan(fees.stern_to!);
  });

  it('is empty at a bay and on a stay day', () => {
    const toBay = previewPlan(makeState(), content, { ...plan, legs: [{ ...leg, routeId: 'r_base_bay_a' }] });
    expect(toBay.berthFees).toEqual({});
    expect(previewPlan(makeState(), content, { ...plan, legs: [] }).berthFees).toEqual({});
  });

  it.each(['stern_to', 'side_to'] as const)('matches what arrive charges for %s', (berth) => {
    const fee = previewPlan(atBayA(2), content, { ...plan, berth }).berthFees[berth]!;
    let charged: number | null = null;
    for (let seed = 1; seed < 40 && charged === null; seed++) {
      const s = { ...makeState({ locationId: 'marina_b', clockMin: 10 * 60, rng: seed }), voices: atBayA(2).voices };
      const entry = arrive(s, content, requireBoat(content, s), undefined, berth).state.log.find((e) => e.cause === 'marina:fee');
      if (entry) charged = -entry.delta!.moneyEur!;
    }
    expect(charged).toBe(fee);
  });
});
