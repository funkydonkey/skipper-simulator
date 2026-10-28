import { describe, expect, it } from 'vitest';
import { exposure, pointShelter, realWind, rollDayWeather, shiftDir, signalsVisible } from '../../src/engine/weather';
import { DIRS } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import type { DayWeather } from '../../src/engine/types';

const content = makeContent();
const b = content.balance;
const template = content.weather[0]!;

const calm: DayWeather = { day: 3, forecastKn: 12, forecastGustKn: 18, forecastDir: 'NW', barometerHpa: 1015, front: false, frontAddKn: 0, frontDir: 'NW', barometerTrendHpa: 0, signalsVisible: false };

describe('weather', () => {
  it('shiftDir wraps around the compass', () => {
    expect(shiftDir('NW', 2)).toBe('NE');
    expect(shiftDir('N', -1)).toBe('NW');
    expect(shiftDir('S', 8)).toBe('S');
  });

  it('rollDayWeather is deterministic and copies the forecast', () => {
    const flat = { ...template, jitter: { dirSteps: 0, kn: 0 } };
    const a = rollDayWeather(10, flat, 1, b);
    expect(a).toEqual(rollDayWeather(10, flat, 1, b));
    expect(a.value.weather.forecastKn).toBe(12);
    expect(a.value.weather.front).toBe(false);
    expect(a.value.weather.frontAddKn).toBe(0);
    expect(a.value.weather.signalsVisible).toBe(false);
  });

  it('front appears with template probability and shifts wind/barometer', () => {
    let s = 1;
    let fronts = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollDayWeather(s, { ...template, jitter: { dirSteps: 0, kn: 0 } }, 3, b);
      if (r.value.weather.front) {
        fronts++;
        expect(r.value.weather.frontAddKn).toBeGreaterThanOrEqual(8);
        expect(r.value.weather.frontAddKn).toBeLessThanOrEqual(12);
        expect(r.value.weather.frontDir).toBe('NE');
        expect(r.value.weather.barometerTrendHpa).toBe(-5);
      }
      s = r.next;
    }
    expect(fronts / 2000).toBeGreaterThan(0.46);
    expect(fronts / 2000).toBeLessThan(0.54);
  });

  it('the barometer reads against yesterday: template drift plus a front drop', () => {
    const drift = { ...template, jitter: { dirSteps: 0, kn: 0 }, days: template.days.map((d) => ({ ...d, frontChance: 0, barometerHpa: 1020 - d.day * 2 })) };
    const day1 = rollDayWeather(1, drift, 1, b).value.weather;
    expect([day1.barometerHpa, day1.barometerTrendHpa]).toEqual([1018, 0]);
    const day2 = rollDayWeather(1, drift, 2, b).value.weather;
    expect([day2.barometerHpa, day2.barometerTrendHpa]).toEqual([1016, -2]);
    const afterFront = rollDayWeather(1, drift, 2, b, true).value.weather;
    expect(afterFront.barometerTrendHpa).toBe(-2 + b.weather.barometerDropHpa);
    const stormy = { ...drift, days: drift.days.map((d) => ({ ...d, frontChance: 1 })) };
    const frontDay = rollDayWeather(1, stormy, 2, b).value.weather;
    expect([frontDay.barometerHpa, frontDay.barometerTrendHpa]).toEqual([1016 - b.weather.barometerDropHpa, -2 - b.weather.barometerDropHpa]);
  });

  it('throws for a day missing from the template', () => {
    expect(() => rollDayWeather(1, template, 9, b)).toThrow(/no day 9/);
  });

  it('realWind = forecast × diurnal × kLocal + front (front only in the afternoon)', () => {
    expect(realWind(calm, 1.4, 10, template, b)).toEqual({ windKn: 16.8, gustKn: 25.2, dir: 'NW', frontActive: false });
    expect(realWind(calm, 1.4, 14, template, b).windKn).toBe(20.2);
    const front = { ...calm, front: true, frontAddKn: 10, frontDir: 'NE' as const };
    expect(realWind(front, 1.4, 10, template, b)).toMatchObject({ windKn: 16.8, dir: 'NW', frontActive: false });
    expect(realWind(front, 1.4, 14, template, b)).toMatchObject({ windKn: 30.2, dir: 'NE', frontActive: true });
  });

  it('realWind after midnight: no afternoon factor, but an active front stays', () => {
    expect(realWind(calm, 1.4, 25, template, b).windKn).toBe(16.8);
    const front = { ...calm, front: true, frontAddKn: 10, frontDir: 'NE' as const };
    expect(realWind(front, 1.4, 25, template, b)).toMatchObject({ windKn: 26.8, dir: 'NE', frontActive: true });
  });

  it('signals are visible with sea sense ≥ 2 or an opened barometer', () => {
    expect(signalsVisible(1, false, b)).toBe(false);
    expect(signalsVisible(2, false, b)).toBe(true);
    expect(signalsVisible(0, true, b)).toBe(true);
  });

  it('exposure is 1 - shelter', () => {
    const bay = content.map.find((p) => p.id === 'bay_a')!;
    expect(exposure(bay, 'N')).toBeCloseTo(0.8);
    expect(exposure(bay, 'S')).toBeCloseTo(0);
  });
});

describe('daily jitter', () => {
  const tpl = { ...template, days: template.days.map((d) => ({ ...d, frontChance: 0 })) };
  const stepDist = (a: string, c: string) => {
    const d = Math.abs(DIRS.indexOf(a as never) - DIRS.indexOf(c as never));
    return Math.min(d, 8 - d);
  };

  it('stays within 1 compass step and 2 kn of the template, and hits both extremes', () => {
    const d = tpl.days[0]!;
    let s = 5;
    const dirDeltas = new Set<number>();
    const knDeltas = new Set<number>();
    for (let i = 0; i < 200; i++) {
      const r = rollDayWeather(s, tpl, 1, b);
      const w = r.value.weather;
      expect(stepDist(w.forecastDir, d.dir)).toBeLessThanOrEqual(1);
      expect(Math.abs(w.forecastKn - d.windKn)).toBeLessThanOrEqual(2);
      expect(w.forecastGustKn - w.forecastKn).toBe(d.gustKn - d.windKn);
      dirDeltas.add(DIRS.indexOf(w.forecastDir) - DIRS.indexOf(d.dir));
      knDeltas.add(w.forecastKn - d.windKn);
      s = r.next;
    }
    expect(knDeltas.has(-2) && knDeltas.has(2)).toBe(true);
    expect(dirDeltas.size).toBe(3);
  });

  it('jitter { dirSteps: 0, kn: 0 } reproduces the template', () => {
    const flat = { ...tpl, jitter: { dirSteps: 0, kn: 0 } };
    const w = rollDayWeather(9, flat, 2, b).value.weather;
    const d = flat.days[1]!;
    expect([w.forecastKn, w.forecastGustKn, w.forecastDir]).toEqual([d.windKn, d.gustKn, d.dir]);
  });

  it('keeps wind non-negative', () => {
    const calmTpl = { ...tpl, days: [{ ...tpl.days[0]!, windKn: 1, gustKn: 2 }], jitter: { dirSteps: 0, kn: 5 } };
    let s = 1;
    for (let i = 0; i < 100; i++) {
      const r = rollDayWeather(s, calmTpl, 1, b);
      expect(r.value.weather.forecastKn).toBeGreaterThanOrEqual(0);
      expect(r.value.weather.forecastGustKn).toBeGreaterThanOrEqual(0);
      s = r.next;
    }
  });
});

describe('pointShelter', () => {
  it('is exposed when exposure exceeds rollyExposure', async () => {
    const { loadContentDir } = await import('../../src/content/load-node');
    const loaded = await loadContentDir('content');
    const vela = loaded.content!.map.find((p) => p.id === 'vela_bay')!;
    expect(pointShelter(vela, 'NW', loaded.content!.balance)).toBe('exposed');
    expect(pointShelter(vela, 'SE', loaded.content!.balance)).toBe('sheltered');
  });
});
