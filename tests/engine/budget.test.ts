import { describe, expect, it } from 'vitest';
import { canAfford, budgetGrade, weekSpend } from '../../src/engine/budget';
import { endDay } from '../../src/engine/day/evening';
import { planDay } from '../../src/engine/day/passage';
import { gradeWeek } from '../../src/engine/debrief';
import { EngineError } from '../../src/engine/errors';
import { priceFor } from '../../src/engine/perks';
import { previewPlan } from '../../src/engine/preview';
import type { DayFacts, DayPlan, GameState, LegPlan } from '../../src/engine/types';
import { weekScore } from '../../src/sim/run';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const boat = content.boats[0]!;
const leg = (mode: LegPlan['mode'], routeId = 'r_base_bay_a'): LegPlan => ({ routeId, mode, reefs: 0, genoa: 'full', course: 'direct' });
const plan = (legs: LegPlan[]): DayPlan => ({ departureHour: 9, legs, swimStops: 0, shower: 'normal', autopilot: false });
const causes = (s: GameState): string[] => s.log.map((e) => e.cause);
const withWind = (s: GameState, kn: number): GameState => ({ ...s, weather: { ...s.weather!, forecastKn: kn, forecastGustKn: kn + 1 } });
const withRes = (s: GameState, over: Partial<GameState['resources']>): GameState => ({ ...s, resources: { ...s.resources, ...over } });
const noMotor = (s: GameState): GameState => ({ ...s, systems: { ...s.systems, engine_cooling: { state: 'ok', wear: 0, broken: true } } });
const noSail = (s: GameState): GameState => ({ ...s, systems: { ...s.systems, rig: { state: 'ok', wear: 0, broken: true } } });
const legInfo = (s: GameState) => s.log.find((e) => e.cause.startsWith('leg:'))!.data!;
const tow = 'rescue:tow:r_base_bay_a';

describe('tow', () => {
  it('fuel 0 in a calm: the leg is towed for towEur, towHours and mood', () => {
    const start = withRes(withWind(makeState(), 3), { fuelL: 0 });
    const s = planDay(start, content, plan([leg('motor')]));
    expect(legInfo(s).windKn as number).toBeLessThan(b.sails.minSailWindKn);
    const e = s.log.find((x) => x.cause === tow)!;
    expect(e.delta).toMatchObject({ moneyEur: -b.rescue.towEur, mood: -b.rescue.towMoodPenalty });
    expect(e.data).toMatchObject({ time_hours: b.rescue.towHours });
    expect(legInfo(s).hours).toBe(b.rescue.towHours);
    expect(s.resources.moneyEur).toBe(start.resources.moneyEur - b.rescue.towEur);
    expect(s.locationId).toBe('bay_a');
    expect(s.phase).toBe('evening');
  });

  it('fuel 0 with wind 12: sail-only, no tow', () => {
    const s = planDay(withRes(withWind(makeState(), 12), { fuelL: 0 }), content, plan([leg('motor')]));
    expect(causes(s)).toContain('zero:fuel');
    expect(causes(s)).not.toContain(tow);
    expect(s.resources.moneyEur).toBe(1500);
  });

  it('noMotor in a calm: towed', () => {
    const s = planDay(noMotor(withWind(makeState(), 3)), content, plan([leg('motor')]));
    expect(causes(s)).toEqual(expect.arrayContaining(['system:no_motor:r_base_bay_a', tow]));
  });

  it('noMotor with wind 12: no tow', () => {
    const s = planDay(noMotor(withWind(makeState(), 12)), content, plan([leg('motor')]));
    expect(causes(s)).not.toContain(tow);
  });

  it('noMotor + noSail drifts into a tow even in wind', () => {
    const s = planDay(noSail(noMotor(withWind(makeState(), 12))), content, plan([leg('sail')]));
    expect(causes(s)).toContain(tow);
    expect(s.locationId).toBe('bay_a');
  });

  it('a sail leg in a calm with a working engine is not towed', () => {
    const s = planDay(withRes(withWind(makeState(), 3), { fuelL: 0 }), content, plan([leg('sail')]));
    expect(causes(s)).not.toContain(tow);
  });
});

describe('no money', () => {
  const toMarina = (money: number, over: Partial<GameState> = {}): GameState =>
    planDay(withWind(withRes(makeState({ locationId: 'bay_a', clockMin: 9 * 60, ...over }), { moneyEur: money }), 10), content, plan([leg('motor', 'r_bay_a_marina_b')]));

  it('a marina fee above the money: no_money, no refusal roll, anchors outside, the day completes', () => {
    const s = toMarina(20);
    expect(causes(s)).toContain('marina:no_money');
    expect(causes(s)).not.toContain('roll:marina:marina_b');
    expect(causes(s)).not.toContain('marina:fee');
    expect(s.dayFacts!.mooring).toBe('anchor');
    expect(s.phase).toBe('evening');
    expect(s.locationId).toBe('marina_b');
  });

  it('money exactly equal to the discounted fee still berths', () => {
    const fee = priceFor(80, makeState().voices.economist, b).eur;
    const s = toMarina(fee + 0);
    expect(causes(s)).not.toContain('marina:no_money');
    expect(causes(s)).toContain('marina:fee');
    expect(s.dayFacts!.mooring).toBe('berth');
  });

  it('taverna with money below the bill throws NO_MONEY; cook still works', () => {
    const facts: DayFacts = { day: 1, departureHour: 9, arrivalHour: 12, arrivalPointKind: 'marina', mooring: 'berth', activities: [], motorHours: 0, sailHours: 2, autopilotHours: 0, maxWindKn: 10, shower: 'normal' };
    const evening = withRes(makeState({ phase: 'evening', locationId: 'marina_b', dayFacts: facts, clockMin: 17 * 60 }), { moneyEur: 10 });
    expect(() => endDay(evening, content, { dinner: 'taverna' })).toThrowError(expect.objectContaining({ code: 'NO_MONEY' }));
    expect(() => endDay(evening, content, { dinner: 'taverna' })).toThrow(EngineError);
    expect(endDay(evening, content, { dinner: 'cook' }).phase).toBe('morning');
  });

  it('preview exposes marinaAffordable', () => {
    const p = (money: number, legs: LegPlan[]) => previewPlan(withRes(makeState({ locationId: 'bay_a' }), { moneyEur: money }), content, plan(legs));
    expect(p(20, [leg('motor', 'r_bay_a_marina_b')]).marinaAffordable).toBe(false);
    expect(p(1000, [leg('motor', 'r_bay_a_marina_b')]).marinaAffordable).toBe(true);
    expect(p(0, []).marinaAffordable).toBe(true);
    expect(previewPlan(withRes(makeState(), { moneyEur: 0 }), content, plan([leg('motor')])).marinaAffordable).toBe(true);
  });

  it('canAfford compares the money with the amount', () => {
    expect(canAfford(makeState(), 1500)).toBe(true);
    expect(canAfford(makeState(), 1501)).toBe(false);
  });
});

describe('budget grade', () => {
  it('good within the week budget, ok within the factor, bad beyond', () => {
    expect(budgetGrade(1400, 100, b)).toBe('good');
    expect(budgetGrade(b.budget.weekEur, 100, b)).toBe('good');
    expect(budgetGrade(2000, 100, b)).toBe('ok');
    expect(budgetGrade(b.budget.weekEur * b.budget.okFactor, 100, b)).toBe('ok');
    expect(budgetGrade(2400, 100, b)).toBe('bad');
  });

  it('negative final money is bad whatever the spend', () => {
    expect(budgetGrade(0, -1, b)).toBe('bad');
    expect(budgetGrade(1400, -1, b)).toBe('bad');
  });

  it('weekSpend = start balance - final money + deposit loss', () => {
    const s = makeState({ startBalanceEur: 2000, resources: { ...makeState().resources, moneyEur: 1200 } });
    expect(weekSpend(s, 300)).toBe(1100);
  });

  it('gradeWeek reports the budget axis', () => {
    const s = makeState({ startBalanceEur: 2000, resources: { ...makeState().resources, moneyEur: 900 } });
    expect(gradeWeek(s, boat, b).scales.budget).toBe('good');
    const poor = makeState({ startBalanceEur: 2000, resources: { ...makeState().resources, moneyEur: -5 } });
    expect(gradeWeek(poor, boat, b).scales.budget).toBe('bad');
  });

  it('weekScore max is 10', () => {
    const scales = { safety: 'good', crew: 'good', boat: 'good', schedule: 'good', budget: 'good' } as const;
    const d = { scales, depositLossEur: 0, depositReturnedEur: 0, links: [], eventNotes: [], voices: [] };
    expect(weekScore(d)).toBe(10);
    expect(weekScore({ ...d, scales: { ...scales, budget: 'bad' } })).toBe(8);
  });
});

