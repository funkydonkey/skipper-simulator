import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { previewPlan } from '../../src/engine/preview';
import type { DayPlan, LegPlan } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const motor = (routeId: string): LegPlan => ({ routeId, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[], departureHour = 9, swimStops = 0): DayPlan => ({ departureHour, legs, swimStops, shower: 'normal', autopilot: false });

describe('previewPlan', () => {
  it('estimates departure, legs and arrival for a one-leg day without touching state', () => {
    const state = deepFreeze(makeState());
    const p = previewPlan(state, content, plan([motor('r_base_bay_a')]));
    expect(p.departureMin).toBe(9 * 60);
    expect(p.destinationId).toBe('bay_a');
    expect(p.legs).toHaveLength(1);
    expect(p.legs[0]).toMatchObject({ routeId: 'r_base_bay_a', from: 'base', to: 'bay_a', distanceNm: 10 });
    expect(p.arrivalMin!).toBeGreaterThan(p.departureMin! + p.legs[0]!.hours * 60);
    expect(p.marinaLate).toBe(false);
    expect(p.fuelNeededL).toBeGreaterThan(0);
  });

  it('shows the odds the captain faces: sail break per leg, anchor drag at a bay, refusal at a marina', () => {
    const b = content.balance;
    const sail: LegPlan = { ...motor('r_base_bay_a'), mode: 'sail' };
    const toBay = previewPlan(makeState(), content, plan([sail]));
    expect(toBay.destinationSeabed).toBe('sand');
    expect(toBay.marinaRefusal).toBeNull();
    expect(toBay.anchorFail!.value).toBeCloseTo(b.time.anchorFailChance[0], 12);
    expect(toBay.legs[0]!.breakChance.value).toBeGreaterThanOrEqual(0);
    expect(previewPlan(makeState(), content, plan([motor('r_base_bay_a')])).legs[0]!.breakChance.value).toBe(0);
    const briefed = previewPlan(makeState({ flags: { 'briefing.anchor': true } }), content, plan([sail]));
    expect(briefed.anchorFail!.value).toBeCloseTo(b.time.anchorFailChance[0] - b.time.anchorBriefedReduction, 12);
    const early = previewPlan(makeState({ locationId: 'bay_a' }), content, plan([motor('r_bay_a_marina_b')], 8));
    expect(early).toMatchObject({ destinationSeabed: 'mud', anchorFail: null, marinaLate: false });
    expect(early.marinaRefusal!.value).toBe(0);
    const late = previewPlan(makeState({ locationId: 'bay_a', clockMin: 16 * 60 }), content, plan([motor('r_bay_a_marina_b')], 16));
    expect(late.marinaLate).toBe(true);
    expect(late.marinaRefusal!.value).toBe(b.time.marinaLateRefusalChance);
    expect(previewPlan(makeState(), content, plan([]))).toMatchObject({ marinaRefusal: null, anchorFail: null, destinationSeabed: 'sand' });
  });

  it('never departs before the current clock', () => {
    const p = previewPlan(makeState({ clockMin: 11 * 60 }), content, plan([motor('r_base_bay_a')], 9));
    expect(p.departureMin).toBe(11 * 60);
  });

  it('shows the local wind effect only to a trained Sea Sense', () => {
    const at = { locationId: 'bay_a' } as const;
    const novice = previewPlan(makeState({ ...at, voices: { ...makeState().voices, sea_sense: 0 } }), content, plan([motor('r_bay_a_marina_b')], 8));
    const skilled = previewPlan(makeState({ ...at, voices: { ...makeState().voices, sea_sense: 2 } }), content, plan([motor('r_bay_a_marina_b')], 8));
    expect(novice.legs[0]!.localEffectKnown).toBe(false);
    expect(skilled.legs[0]!.localEffectKnown).toBe(true);
    expect(skilled.legs[0]!.windKn).toBeCloseTo(novice.legs[0]!.windKn * 1.3, 1);
  });

  it('adds a front only when its signals are visible', () => {
    const weather = { ...makeState().weather!, front: true, frontAddKn: 10, frontDir: 'W' as const };
    const hidden = previewPlan(makeState({ weather: { ...weather, signalsVisible: false } }), content, plan([motor('r_base_bay_a')], 14));
    const seen = previewPlan(makeState({ weather: { ...weather, signalsVisible: true } }), content, plan([motor('r_base_bay_a')], 14));
    expect(seen.legs[0]!.windKn).toBeCloseTo(hidden.legs[0]!.windKn + 10, 1);
    expect(seen.legs[0]!.windDir).toBe('W');
  });

  it('flags a marina reached after its places are gone and an arrival after sunset', () => {
    const late = previewPlan(makeState({ locationId: 'bay_a', clockMin: 16 * 60 }), content, plan([motor('r_bay_a_marina_b')], 16));
    expect(late.marinaLate).toBe(true);
    const dark = previewPlan(makeState({ clockMin: 19 * 60 + 30 }), content, plan([motor('r_base_bay_a')], 19.5));
    expect(dark.arrivalAfterSunset).toBe(true);
  });

  it('a stay-in-place plan has no departure and no arrival', () => {
    const p = previewPlan(makeState(), content, plan([], 9, 2));
    expect(p).toMatchObject({ departureMin: null, arrivalMin: null, destinationId: 'base', legs: [], swimStops: 2 });
  });

  it('rejects a broken route chain and a missing weather roll', () => {
    expect(() => previewPlan(makeState(), content, plan([motor('r_bay_a_marina_b')]))).toThrow(EngineError);
    expect(() => previewPlan(makeState({ weather: null }), content, plan([motor('r_base_bay_a')]))).toThrow(/startDay/);
  });
});
