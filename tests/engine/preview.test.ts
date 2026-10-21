import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { planDay } from '../../src/engine/day/passage';
import { previewPlan } from '../../src/engine/preview';
import type { DayPlan, LegPlan } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const motor = (routeId: string): LegPlan => ({ routeId, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[], departureHour = 9, swimStops = 0): DayPlan => ({ departureHour, legs, swimStops, shower: 'normal', autopilot: false });

describe('previewPlan', () => {
  it("a boat's own motorLph replaces the balance burn rate in the fuel estimate", () => {
    const thirsty = { ...content, boats: content.boats.map((x) => ({ ...x, motorLph: content.balance.fuel.motorLph * 2 })) };
    const base = previewPlan(makeState(), content, plan([motor('r_base_bay_a')]));
    const own = previewPlan(makeState(), thirsty, plan([motor('r_base_bay_a')]));
    expect(own.fuelNeededL).toBeCloseTo(base.fuelNeededL * 2, 0);
  });

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

describe('previewPlan with broken systems', () => {
  const sail = (routeId: string): LegPlan => ({ ...motor(routeId), mode: 'sail' });
  const broken = (...ids: string[]) => {
    const s = makeState();
    const systems = { ...s.systems };
    for (const id of ids) systems[id] = { state: 'ok' as const, wear: 0, broken: true };
    return makeState({ systems });
  };
  const calm = (s: ReturnType<typeof makeState>) => ({ ...s, weather: { ...s.weather!, forecastKn: 3, forecastGustKn: 4 } });
  const b = content.balance;

  it('a working boat keeps the planned mode and needs no tow', () => {
    const p = previewPlan(makeState(), content, plan([motor('r_base_bay_a')]));
    expect(p.legs[0]).toMatchObject({ mode: 'motor', plannedMode: 'motor', tow: null });
  });

  it('engine out: a motor leg shows the sail speed and burns no fuel', () => {
    const s = deepFreeze(broken('engine_cooling'));
    const p = previewPlan(s, content, plan([motor('r_base_bay_a')]));
    const asSail = previewPlan(makeState(), content, plan([sail('r_base_bay_a')]));
    expect(p.legs[0]).toMatchObject({ mode: 'sail', plannedMode: 'motor', tow: null });
    expect(p.legs[0]!.speedKn).toBe(asSail.legs[0]!.speedKn);
    expect(p.legs[0]!.hours).toBe(asSail.legs[0]!.hours);
    expect(p.fuelNeededL).toBe(0);
  });

  it('rig out: a sail leg shows the motor and its fuel, with no sail risk', () => {
    const strong = (s: ReturnType<typeof makeState>) => ({ ...s, weather: { ...s.weather!, forecastKn: 30, forecastGustKn: 36 } });
    const p = previewPlan(strong(broken('rig')), content, plan([sail('r_base_bay_a')]));
    const asMotor = previewPlan(strong(makeState()), content, plan([motor('r_base_bay_a')]));
    expect(p.legs[0]).toMatchObject({ mode: 'motor', plannedMode: 'sail', tow: null, overpowered: false, forcedReef: false });
    expect(p.legs[0]!.breakChance.value).toBe(0);
    expect(p.legs[0]!.hours).toBe(asMotor.legs[0]!.hours);
    expect(p.fuelNeededL).toBe(asMotor.fuelNeededL);
  });

  it('engine out in a wind too weak to sail: shows the tow, its price and its hours', () => {
    const p = previewPlan(calm(broken('engine_cooling')), content, plan([motor('r_base_bay_a')]));
    expect(p.legs[0]!.tow).toEqual({ eur: b.rescue.towEur, hours: b.rescue.towHours });
    expect(p.legs[0]!.hours).toBe(b.rescue.towHours);
    expect(p.fuelNeededL).toBe(0);
    expect(p.arrivalMin!).toBeGreaterThanOrEqual(p.departureMin! + b.time.departureMin + b.rescue.towHours * 60);
  });

  it('engine and rig out: a tow whatever the wind', () => {
    const p = previewPlan(broken('engine_cooling', 'rig'), content, plan([sail('r_base_bay_a')]));
    expect(p.legs[0]!.tow).toEqual({ eur: b.rescue.towEur, hours: b.rescue.towHours });
    expect(p.legs[0]!.breakChance.value).toBe(0);
  });

  it('agrees with the day the engine runs: a tow in the calm, sailing in a breeze', () => {
    const towed = (s: ReturnType<typeof makeState>) => planDay(s, content, plan([motor('r_base_bay_a')])).log.some((e) => e.cause === 'rescue:tow:r_base_bay_a');
    for (const s of [calm(broken('engine_cooling')), broken('engine_cooling')]) {
      expect(previewPlan(s, content, plan([motor('r_base_bay_a')])).legs[0]!.tow !== null).toBe(towed(s));
    }
    expect(towed(calm(broken('engine_cooling')))).toBe(true);
  });
});
