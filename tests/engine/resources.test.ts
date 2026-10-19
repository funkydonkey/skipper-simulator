import { describe, expect, it } from 'vitest';
import { applyOutcome, applyOutcomes, clampResources, dailyConsumption, refillAt, zeroResourceOutcomes } from '../../src/engine/resources';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const boat = content.boats[0]!;
const sharedBoat = { ...boat, starterSeparate: false };

describe('resources', () => {
  it('clampResources keeps values in physical bounds', () => {
    const r = clampResources({ waterL: 999, fuelL: -5, serviceBankPct: 140, starterBankPct: -1, gasPct: 50, moneyEur: -20, mood: 120, fatigue: -3 }, boat);
    expect(r).toEqual({ waterL: 300, fuelL: 0, serviceBankPct: 100, starterBankPct: 0, gasPct: 50, moneyEur: -20, mood: 100, fatigue: 0 });
  });

  it('applyOutcome changes resources, logs delta, does not mutate', () => {
    const s = deepFreeze(makeState());
    const next = applyOutcome(s, boat, { cause: 'event:toilet_clog:call_base', pillar: 'boat', effect: { money: -80, time_hours: 4 } });
    expect(next.resources.moneyEur).toBe(1420);
    expect(next.clockMin).toBe(s.clockMin + 240);
    expect(next.log.at(-1)).toMatchObject({ kind: 'effect', cause: 'event:toilet_clog:call_base', pillar: 'boat', delta: { moneyEur: -80 }, data: { time_hours: 4 } });
    expect(s.resources.moneyEur).toBe(1500);
  });

  it('delta reflects clamping (no negative fuel)', () => {
    const s = makeState({ resources: { ...makeState().resources, fuelL: 2 } });
    const next = applyOutcome(s, boat, { cause: 'consumption:fuel', effect: { fuel: -13.5 } });
    expect(next.resources.fuelL).toBe(0);
    expect(next.log.at(-1)!.delta).toEqual({ fuelL: -2 });
  });

  it('damage, repair, flag, injury, mood_per_day, signal', () => {
    let s = makeState();
    s = applyOutcome(s, boat, { cause: 'sail:break', effect: { damage: 'sail_torn' } });
    s = applyOutcome(s, boat, { cause: 'sail:break', effect: { damage: 'sail_torn' } });
    expect(s.damages).toEqual(['sail_torn']);
    s = applyOutcome(s, boat, { cause: 'repair', effect: { repair: 'sail_torn' } });
    expect(s.damages).toEqual([]);
    s = applyOutcome(s, boat, { cause: 'x', effect: { flag: 'warned', injury: true, mood_per_day: -8 } });
    expect(s.flags['flag.warned']).toBe(true);
    expect(s.injuries).toBe(1);
    expect(s.moodPerDay).toBe(-8);
    s = applyOutcome(s, boat, { cause: 'event:local_warning:listen', pillar: 'weather', effect: { signal: 'local_warning' } });
    expect(s.log.at(-1)).toMatchObject({ kind: 'signal', cause: 'signal:local_warning', pillar: 'weather' });
  });

  it('an injury from a non-injury cause also logs injury:<cause> for the debrief', () => {
    const s = applyOutcome(makeState(), boat, { cause: 'event:loaded_sheet:let_him:fail', pillar: 'safety', effect: { injury: true, mood: -30 } });
    expect(s.log.map((e) => e.cause)).toEqual(['event:loaded_sheet:let_him:fail', 'injury:event:loaded_sheet:let_him:fail']);
    expect(s.log.at(-1)).toMatchObject({ kind: 'effect', pillar: 'safety' });
    expect(s.injuries).toBe(1);
    const direct = applyOutcome(makeState(), boat, { cause: 'injury:reef_underway', pillar: 'safety', effect: { injury: true } });
    expect(direct.log.map((e) => e.cause)).toEqual(['injury:reef_underway']);
  });

  it('shared bank: service drain also drains the starter', () => {
    const s = makeState();
    expect(applyOutcome(s, boat, { cause: 'c', effect: { service_bank: -30 } }).resources.starterBankPct).toBe(100);
    expect(applyOutcome(s, sharedBoat, { cause: 'c', effect: { service_bank: -30 } }).resources.starterBankPct).toBe(70);
  });

  it('applyOutcomes folds in order', () => {
    const s = applyOutcomes(makeState(), boat, [{ cause: 'a', effect: { mood: -10 } }, { cause: 'b', effect: { mood: 5 } }]);
    expect(s.resources.mood).toBe(65);
    expect(s.log).toHaveLength(2);
  });

  it('dailyConsumption: water by discipline, electric Ah→%, starter charge, gas', () => {
    const out = dailyConsumption({ crewSize: 4, shower: 'normal', boat, motorHours: 2, sailHours: 0, autopilotHours: 0, shorePower: false, cookedDinner: true }, b);
    const by = Object.fromEntries(out.map((o) => [o.cause, o.effect]));
    expect(by['consumption:water']).toEqual({ water: -100 });
    expect(by['consumption:electric']).toEqual({ service_bank: -3.6 });
    expect(by['charge:starter']).toEqual({ starter_bank: 100 });
    expect(by['consumption:gas']).toEqual({ gas: -9 });
  });

  it('dailyConsumption: loose showers and autopilot drain more; shore power refills', () => {
    const loose = dailyConsumption({ crewSize: 4, shower: 'loose', boat, motorHours: 0, sailHours: 6, autopilotHours: 6, shorePower: false, cookedDinner: false }, b);
    const by = Object.fromEntries(loose.map((o) => [o.cause, o.effect]));
    expect(by['consumption:water']).toEqual({ water: -160 });
    // draw = 45 fridge + 10 pumps + 6h×1.5 plotter + 6h×4 autopilot = 88 Ah of 220 Ah → −40%
    expect(by['consumption:electric']!.service_bank).toBeCloseTo(-40, 1);
    expect(by['charge:starter']).toBeUndefined();
    expect(by['consumption:gas']).toBeUndefined();
    const shore = dailyConsumption({ crewSize: 4, shower: 'strict', boat, motorHours: 0, sailHours: 0, autopilotHours: 0, shorePower: true, cookedDinner: false }, b);
    expect(shore.find((o) => o.cause === 'charge:shore')!.effect).toEqual({ service_bank: 100 });
  });

  it('refillAt marina: water free, fuel paid, gas exchanged when low', () => {
    const s = makeState({ resources: { ...makeState().resources, waterL: 100, fuelL: 140, gasPct: 20 } });
    const marina = content.map.find((p) => p.id === 'marina_b')!;
    const out = refillAt(s, boat, marina, b);
    expect(out).toEqual([
      { cause: 'refill:water', pillar: 'boat', effect: { water: 200 } },
      { cause: 'refill:fuel', pillar: 'boat', effect: { fuel: 10, money: -19 } },
      { cause: 'refill:gas', pillar: 'boat', effect: { gas: 80, money: -30 } },
    ]);
    expect(refillAt(s, boat, content.map.find((p) => p.id === 'bay_a')!, b)).toEqual([]);
  });

  it('zeroResourceOutcomes penalises empty water and service bank', () => {
    const s = makeState({ resources: { ...makeState().resources, waterL: 0, serviceBankPct: 0 } });
    expect(zeroResourceOutcomes(s, b)).toEqual([
      { cause: 'zero:water', pillar: 'boat', effect: { mood: -25 } },
      { cause: 'zero:service', pillar: 'boat', effect: { mood: -15 } },
    ]);
    expect(zeroResourceOutcomes(makeState(), b)).toEqual([]);
  });
});
