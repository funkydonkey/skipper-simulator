import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { MapPointSchema } from '../../src/content/schema';
import { buildConditionContext, evaluateCondition as evaluate } from '../../src/engine/expr';
import { arrivalSituation, forecastSituation, marineroSpec, situationContext, windSide } from '../../src/engine/situation';
import type { DayPlan, MapPoint, Situation } from '../../src/engine/types';
import { requirePoint } from '../../src/engine/state';
import { validatePlan } from '../../src/engine/day/passage';
import { endDay } from '../../src/engine/day/evening';
import { deepFreeze } from '../fixtures/freeze';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const real = loaded.content;
const b = real.balance;

const stateAt = (locationId: string, over = {}) => makeState({
  locationId, weatherTemplateId: 'meltemi_week', boatId: real.boats[0]!.id, systems: {}, ...over,
});
const toNisi: DayPlan = {
  departureHour: 9, swimStops: 0, shower: 'normal', autopilot: false, berth: 'side_to',
  legs: [{ routeId: 'r_cala_azzurra_nisi_quay', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }],
};

describe('windSide', () => {
  it('maps the wind bearing against the bow heading', () => {
    expect(windSide(0, 0, 10, b)).toBe('bow');
    expect(windSide(90, 0, 10, b)).toBe('starboard');
    expect(windSide(180, 0, 10, b)).toBe('stern');
    expect(windSide(270, 0, 10, b)).toBe('port');
    expect(windSide(45, 0, 10, b)).toBe('bow');
    expect(windSide(315, 0, 10, b)).toBe('bow');
    expect(windSide(135, 0, 10, b)).toBe('stern');
    expect(windSide(225, 0, 10, b)).toBe('stern');
    expect(windSide(0, 180, 10, b)).toBe('stern');
  });
  it('is none below the calm threshold', () => {
    expect(windSide(0, 0, 3, b)).toBe('none');
    expect(windSide(0, 0, b.situation.calmKn, b)).toBe('bow');
  });
});

describe('forecastSituation', () => {
  it('describes the planned berth with forecast marinero odds, without RNG', () => {
    const state = deepFreeze(stateAt('cala_azzurra'));
    const s = forecastSituation(state, real, toNisi)!;
    expect(s).toMatchObject({ berth: 'side_to', source: 'forecast', seabed: 'sand', tight: false, windKn: 12, windDir: 'NW' });
    expect(s.marineroOdds!.value).toBeCloseTo(0.3, 12);
    expect(s.marinero).toBe(false);
    expect(s.windSide).toBe('stern');
  });
  it('halves marinero odds after 18:00 and defaults to the first berth', () => {
    const late = { ...toNisi, berth: undefined, departureHour: 17 };
    const s = forecastSituation(stateAt('cala_azzurra', { clockMin: 17 * 60 }), real, late)!;
    expect(s.berth).toBe('stern_to');
    expect(s.marineroOdds!.value).toBeCloseTo(0.15, 12);
  });
  it('marinero is the likelier outcome and bays have no odds', () => {
    const toKastri: DayPlan = { ...toNisi, berth: undefined, legs: [{ ...toNisi.legs[0]!, routeId: 'r_cala_azzurra_kastri_marina' }] };
    const k = forecastSituation(stateAt('cala_azzurra'), real, toKastri)!;
    expect(k).toMatchObject({ marinero: true, tight: true, berth: 'stern_to' });
    const toBay: DayPlan = { ...toNisi, berth: undefined, legs: [{ ...toNisi.legs[0]!, routeId: 'r_cala_azzurra_vela_bay' }] };
    const v = forecastSituation(stateAt('cala_azzurra'), real, toBay)!;
    expect(v).toMatchObject({ berth: 'anchor', marinero: false, marineroOdds: null });
  });
  it('is null on a stay day', () => {
    expect(forecastSituation(stateAt('cala_azzurra'), real, { ...toNisi, legs: [] })).toBeNull();
  });
});

describe('arrivalSituation', () => {
  it('rolls marinero once at a marina and logs nothing itself', () => {
    const state = stateAt('kastri_marina');
    const r = arrivalSituation(state, real, requirePoint(real, 'kastri_marina'), 'stern_to');
    expect(r.next).not.toBe(state.rng);
    expect(r.value).toMatchObject({ berth: 'stern_to', source: 'fact', tight: true, seabed: 'mud' });
    expect(r.value.marineroOdds!.value).toBeCloseTo(0.8, 12);
  });
  it('makes no draw at a bay', () => {
    const state = stateAt('cala_azzurra');
    const r = arrivalSituation(state, real, requirePoint(real, 'cala_azzurra'), 'anchor');
    expect(r.next).toBe(state.rng);
    expect(r.value).toMatchObject({ marinero: false, marineroOdds: null, berth: 'anchor' });
  });
  it('uses the real wind at the arrival clock', () => {
    const state = stateAt('cala_azzurra', { clockMin: 15 * 60, weather: { ...makeState().weather!, front: true, frontAddKn: 10, frontDir: 'N', signalsVisible: false } });
    const r = arrivalSituation(state, real, requirePoint(real, 'cala_azzurra'), 'anchor');
    expect(r.value.windKn).toBeGreaterThan(12);
  });
});

describe('marineroSpec', () => {
  it('halves after 18:00', () => {
    const p = requirePoint(real, 'nisi_quay');
    expect(marineroSpec(p, b)).toEqual({ base: 0.3, mods: [{ if: 'hour >= 18', mul: -0.5, label: 'marinero' }] });
  });
});

describe('condition context', () => {
  it('has neutral values without a situation', () => {
    const ctx = buildConditionContext(makeState(), makeContent());
    expect(ctx['wind.side']).toBe('none');
    expect(ctx['place.marinero']).toBe(false);
    expect(ctx['place.tight']).toBe(false);
    expect(ctx['place.berth']).toBe('');
    expect(ctx['wind.dir']).toBe('NW');
    expect(situationContext(null)).toMatchObject({ 'wind.side': 'none', 'place.berth': '' });
  });
  it('exposes the situation', () => {
    const s: Situation = { berth: 'side_to', windSide: 'port', windKn: 14, windDir: 'W', marinero: true, marineroOdds: null, seabed: 'sand', tight: true, source: 'fact' };
    const ctx = { ...situationContext(s) };
    expect(ctx).toEqual({ 'wind.side': 'port', 'wind.kn': 14, 'wind.dir': 'W', 'place.marinero': true, 'place.tight': true, 'place.berth': 'side_to' });
    expect(evaluate("wind.side == 'port' || wind.side == 'starboard'", ctx)).toBe(true);
  });
  it('buildConditionContext spreads the state situation', () => {
    const s: Situation = { berth: 'anchor', windSide: 'stern', windKn: 9, windDir: 'S', marinero: false, marineroOdds: null, seabed: 'sand', tight: false, source: 'fact' };
    const ctx = buildConditionContext(makeState({ situation: s }), makeContent());
    expect(ctx['wind.side']).toBe('stern');
    expect(ctx['place.berth']).toBe('anchor');
  });
});

describe('content', () => {
  it('schema rejects a bay with a stern_to berth, and a bay with marinero', () => {
    const bay = real.map.find((p) => p.id === 'cala_azzurra')! as MapPoint;
    expect(MapPointSchema.safeParse(bay).success).toBe(true);
    const bad = { ...bay, berths: [{ type: 'stern_to', headingDeg: 0 }] };
    expect(MapPointSchema.safeParse(bad).success).toBe(false);
    const marina = real.map.find((p) => p.id === 'kastri_marina')! as MapPoint;
    expect(MapPointSchema.safeParse({ ...marina, berths: [{ type: 'anchor', headingDeg: 0 }] }).success).toBe(false);
    expect(MapPointSchema.safeParse({ ...bay, marineroChance: 0.5 }).success).toBe(false);
    expect(MapPointSchema.safeParse({ ...bay, berths: [] }).success).toBe(false);
    expect(MapPointSchema.safeParse({ ...bay, marineroChance: 1.5 }).success).toBe(false);
  });
});

describe('endDay', () => {
  it('resets situation to null', () => {
    const c = makeContent();
    const s: Situation = { berth: 'anchor', windSide: 'none', windKn: 0, windDir: 'N', marinero: false, marineroOdds: null, seabed: 'sand', tight: false, source: 'fact' };
    const state = makeState({
      phase: 'evening', situation: s, locationId: 'base',
      dayFacts: { day: 1, departureHour: null, arrivalHour: null, arrivalPointKind: null, mooring: 'berth', activities: [], motorHours: 0, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal' },
    });
    expect(endDay(state, c, { dinner: 'cook' }).situation).toBeNull();
  });
});

describe('validatePlan berth', () => {
  it('rejects a berth the destination does not offer', () => {
    const state = stateAt('cala_azzurra');
    expect(() => validatePlan(state, real, toNisi)).not.toThrow();
    expect(() => validatePlan(state, real, { ...toNisi, berth: 'anchor' })).toThrow(/berth/);
  });
});
