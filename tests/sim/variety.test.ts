import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { runBatch, varietyOf } from '../../src/sim/batch';
import { runWeek, setupWeek } from '../../src/sim/run';
import { carefulBerth, makeStrategy } from '../../src/sim/strategies';
import { startDay } from '../../src/engine/day/morning';
import type { DayPlan, DayWeather, GameState, LogEntry } from '../../src/engine/types';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;

const order = (outcome: 'ok' | 'wrong', maneuverId: string, steps: string[], day = 1): LogEntry => ({
  day, clockMin: 0, kind: 'decision', cause: `order:${outcome}:${maneuverId}`, pillar: 'safety', data: { steps },
});
const week = (log: LogEntry[], weatherTemplateId: string): GameState => ({ log, weatherTemplateId }) as unknown as GameState;

describe('varietyOf', () => {
  it('counts 3 distinct mooring_med step sets in one week as 3, ignoring other maneuvers', () => {
    const log = [
      order('ok', 'mooring_med', ['a', 'b']),
      order('wrong', 'mooring_med', ['b', 'a'], 2),
      order('ok', 'mooring_med', ['a', 'b', 'c'], 3),
      order('ok', 'mooring_med', ['a', 'b'], 4),
      order('ok', 'mooring_side_to', ['x', 'y'], 5),
      order('ok', 'anchoring_bay', ['p'], 5),
    ];
    const v = varietyOf([{ state: week(log, 'meltemi_week'), forecastDirs: ['NW', 'N'] }]);
    expect(v.meanWeeklyMooringSets).toBe(3);
    expect(v.mooringStepSets).toBe(3);
    expect(v.templatesSeen).toBe(1);
    expect(v.windDirsSeen).toBe(2);
  });

  it('unions step sets, templates and wind directions across weeks; a week without mooring counts 0', () => {
    const v = varietyOf([
      { state: week([order('ok', 'mooring_med', ['a'])], 't1'), forecastDirs: ['N'] },
      { state: week([order('ok', 'mooring_med', ['a']), order('ok', 'mooring_med', ['b'])], 't2'), forecastDirs: ['S', 'N'] },
      { state: week([], 't2'), forecastDirs: ['E'] },
    ]);
    expect(v.mooringStepSets).toBe(2);
    expect(v.meanWeeklyMooringSets).toBe(1);
    expect(v.templatesSeen).toBe(2);
    expect(v.windDirsSeen).toBe(3);
  });

  it('is all zero for no weeks', () => {
    expect(varietyOf([])).toEqual({ mooringStepSets: 0, meanWeeklyMooringSets: 0, templatesSeen: 0, windDirsSeen: 0 });
  });
});

describe('runBatch variety', () => {
  it('exposes variety for a real batch', () => {
    const v = runBatch(content, makeStrategy('careful', 'meltemi_40'), [1, 2, 3, 4, 5]).variety;
    expect(v.mooringStepSets).toBeGreaterThanOrEqual(1);
    expect(v.templatesSeen).toBeGreaterThanOrEqual(1);
    expect(v.windDirsSeen).toBeGreaterThanOrEqual(1);
    expect(v.meanWeeklyMooringSets).toBeGreaterThan(0);
  });

  it('runWeek records one forecast direction per sailed day', () => {
    const r = runWeek(content, 3, makeStrategy('careful', 'aurora_45'));
    expect(r.forecastDirs).toHaveLength(content.balance.schedule.days);
  });
});

describe('carefulBerth', () => {
  const morning = (at: string, dir: DayWeather['forecastDir']): GameState => {
    const s = startDay(setupWeek(content, 1, makeStrategy('careful', 'meltemi_40')), content, { openBarometer: true });
    return { ...s, locationId: at, weather: { ...s.weather!, forecastDir: dir, frontDir: dir, front: false, forecastKn: 14 } };
  };
  const planTo = (routeId: string): DayPlan => ({
    departureHour: 8.5, legs: [{ routeId, mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }], swimStops: 0, shower: 'strict', autopilot: false,
  });

  it('chooses side-to at the quay when the stern-to berth would take the wind on the bow or stern', () => {
    // nisi_quay stern-to heading 0: wind from N is on the bow, from S on the stern, from E abeam.
    expect(carefulBerth(morning('cala_azzurra', 'N'), content, planTo('r_cala_azzurra_nisi_quay'))).toBe('side_to');
    expect(carefulBerth(morning('cala_azzurra', 'S'), content, planTo('r_cala_azzurra_nisi_quay'))).toBe('side_to');
    expect(carefulBerth(morning('cala_azzurra', 'E'), content, planTo('r_cala_azzurra_nisi_quay'))).toBeUndefined();
  });

  it('chooses anchor_ashore in a tight bay when exposed to the wind, else the default', () => {
    // fjord_bay (tight) shelter NE 0.3: exposure 0.7 > rollyExposure 0.5 → exposed; S 0.9 → sheltered.
    expect(carefulBerth(morning('kastri_marina', 'NE'), content, planTo('r_kastri_marina_fjord_bay'))).toBe('anchor_ashore');
    expect(carefulBerth(morning('kastri_marina', 'S'), content, planTo('r_kastri_marina_fjord_bay'))).toBeUndefined();
  });

  it('keeps the default on a stay day and where the destination has a single berth', () => {
    expect(carefulBerth(morning('cala_azzurra', 'S'), content, { ...planTo('r_cala_azzurra_nisi_quay'), legs: [] })).toBeUndefined();
    expect(carefulBerth(morning('cala_azzurra', 'S'), content, planTo('r_base_marina_cala_azzurra'))).toBeUndefined();
  });

  it('careful plans carry the chosen berth through a real week without validation errors', () => {
    for (const boat of ['aurora_45', 'meltemi_40', 'calypso_38']) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) expect(runWeek(content, seed, makeStrategy('careful', boat)).state.phase).toBe('debrief');
    }
  });
});
