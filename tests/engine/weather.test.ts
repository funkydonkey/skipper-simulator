import { describe, expect, it } from 'vitest';
import { exposure, realWind, rollDayWeather, shiftDir, signalsVisible } from '../../src/engine/weather';
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
    const a = rollDayWeather(10, template, 1, b);
    expect(a).toEqual(rollDayWeather(10, template, 1, b));
    expect(a.value.weather.forecastKn).toBe(12);
    expect(a.value.weather.front).toBe(false);
    expect(a.value.weather.frontAddKn).toBe(0);
    expect(a.value.weather.signalsVisible).toBe(false);
  });

  it('front appears with template probability and shifts wind/barometer', () => {
    let s = 1;
    let fronts = 0;
    for (let i = 0; i < 2000; i++) {
      const r = rollDayWeather(s, template, 3, b);
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
