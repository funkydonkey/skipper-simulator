import { EngineError } from './errors';
import { chance, nextRange, type RngResult } from './rng';
import { round1 } from './state';
import { DIRS, type Balance, type DayWeather, type Dir8, type MapPoint, type WeatherTemplate } from './types';

export interface RealWind { windKn: number; gustKn: number; dir: Dir8; frontActive: boolean }

export function shiftDir(dir: Dir8, steps: number): Dir8 {
  const i = DIRS.indexOf(dir);
  return DIRS[(((i + steps) % 8) + 8) % 8]!;
}

/** Always consumes 2 draws so later rolls don't depend on whether a front happened. */
export function rollDayWeather(rng: number, template: WeatherTemplate, day: number, b: Balance): RngResult<DayWeather> {
  const d = template.days.find((x) => x.day === day);
  if (!d) throw new EngineError('CONTENT', `Weather template ${template.id} has no day ${day}`);
  const front = chance(rng, d.frontChance);
  const add = nextRange(front.next, b.weather.frontAddKn[0], b.weather.frontAddKn[1]);
  return {
    value: {
      day,
      forecastKn: d.windKn,
      forecastGustKn: d.gustKn,
      forecastDir: d.dir,
      barometerHpa: d.barometerHpa,
      front: front.value,
      frontAddKn: front.value ? round1(add.value) : 0,
      frontDir: front.value ? shiftDir(d.dir, b.weather.frontShiftSteps) : d.dir,
      barometerTrendHpa: front.value ? -b.weather.barometerDropHpa : 0,
      signalsVisible: false,
    },
    next: add.next,
  };
}

const MIDNIGHT_HOUR = 24;

/**
 * ТЗ 4.3: W_real = W_forecast × k_local + F_front. The afternoon breeze dies at midnight;
 * a front arrives in the afternoon and stays through the night.
 */
export function realWind(w: DayWeather, kLocal: number, hour: number, template: WeatherTemplate, b: Balance): RealWind {
  const sinceAfternoon = hour >= b.weather.afternoonFromHour;
  const diurnal = sinceAfternoon && hour < MIDNIGHT_HOUR ? template.afternoonFactor : 1;
  const frontActive = w.front && sinceAfternoon;
  const add = frontActive ? w.frontAddKn : 0;
  return {
    windKn: round1(w.forecastKn * diurnal * kLocal + add),
    gustKn: round1(w.forecastGustKn * diurnal * kLocal + add),
    dir: frontActive ? w.frontDir : w.forecastDir,
    frontActive,
  };
}

export function signalsVisible(seaSenseLevel: number, barometerOpened: boolean, b: Balance): boolean {
  return barometerOpened || seaSenseLevel >= b.voices.seaSenseSignalLevel;
}

export function exposure(point: MapPoint, dir: Dir8): number {
  return 1 - point.shelter[dir];
}
