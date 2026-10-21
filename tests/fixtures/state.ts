import type { GameState } from '../../src/engine/types';

/** A day-1 planning state at `base` on `test_boat`. Override any field per test. */
export function makeState(overrides: Partial<GameState> = {}): GameState {
  const base: GameState = {
    version: 4,
    seed: 42,
    rng: 42,
    lang: 'ru',
    phase: 'planning',
    day: 1,
    clockMin: 8 * 60,
    weatherTemplateId: 'test_week',
    locationId: 'base',
    boatId: 'test_boat',
    voices: { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2, pride: 2, crew_voice: 2 },
    voiceXp: { sea_sense: 0, caution: 0, order: 0, mechanic: 0, diplomat: 0, economist: 0 },
    resources: { waterL: 300, fuelL: 150, serviceBankPct: 100, starterBankPct: 100, gasPct: 100, moneyEur: 1500, mood: 70, fatigue: 10 },
    flags: {},
    damages: [],
    systems: {
      engine_cooling: { state: 'ok', wear: 0, broken: false },
      heads: { state: 'ok', wear: 0, broken: false },
      rig: { state: 'ok', wear: 0, broken: false },
      bow_thruster: { state: 'worn', wear: 0, broken: false },
    },
    crew: [
      { id: 'crew_1', archetypeId: 'party', name: { ru: 'Аня', en: 'Anya' } },
      { id: 'crew_2', archetypeId: 'sailor', name: { ru: 'Ира', en: 'Ira' } },
      { id: 'crew_3', archetypeId: 'party', name: { ru: 'Олег', en: 'Oleg' } },
      { id: 'crew_4', archetypeId: 'sailor', name: { ru: 'Макс', en: 'Max' } },
    ],
    expectations: [],
    moodPerDay: 0,
    injuries: 0,
    log: [],
    firedEvents: [],
    eventQueue: [],
    weather: { day: 1, forecastKn: 12, forecastGustKn: 18, forecastDir: 'NW', barometerHpa: 1015, front: false, frontAddKn: 0, frontDir: 'NW', barometerTrendHpa: 0, signalsVisible: false },
    dayFacts: null,
    returnedOnTime: null,
    defects: [],
    startBalanceEur: 1500,
    checkin: null,
    situation: null,
  };
  return { ...base, ...overrides };
}
