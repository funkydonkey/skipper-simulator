import balanceJson from './balance.json';

// balance.json mirrors content/core/balance.json except simTargets.weakness, which must name this fixture's own
// boat and systems (crossValidate checks them against content.boats / content.systems).
import type { Balance, Content, Dir8, LocalizedText, MapPoint } from '../../src/engine/types';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });
const shelter = (v: Partial<Record<Dir8, number>>, d = 0.5): Record<Dir8, number> => ({
  N: d, NE: d, E: d, SE: d, S: d, SW: d, W: d, NW: d, ...v,
});
const allServices = { water: true, fuel: true, shorePower: true, gas: true, taverna: true, beach: false };
const noServices = { water: false, fuel: false, shorePower: false, gas: false, taverna: false, beach: true };

const map: MapPoint[] = [
  { id: 'base', name: t('База', 'Base'), kind: 'base', x: 0, y: 0, seabed: 'sand', shelter: shelter({}, 0.9), priceEur: 0, placesGoneHour: null, services: allServices, berths: [{ type: 'stern_to', headingDeg: 180 }], marineroChance: 0.9 },
  { id: 'bay_a', name: t('Бухта А', 'Bay A'), kind: 'bay', x: 0, y: 10, seabed: 'sand', shelter: shelter({ N: 0.2, NE: 0.3, NW: 0.3, E: 0.8, W: 0.8 }, 1), priceEur: 0, placesGoneHour: null, services: noServices, berths: [{ type: 'anchor', headingDeg: 0 }], marineroChance: 0 },
  { id: 'marina_b', name: t('Марина Б', 'Marina B'), kind: 'marina', x: 8, y: 10, seabed: 'mud', shelter: shelter({}, 0.95), priceEur: 80, placesGoneHour: 15, services: allServices, berths: [{ type: 'stern_to', headingDeg: 270 }], marineroChance: 0.7 },
];

/** Minimal 3-point world for unit tests of Waves 1–3. Real content lives in content/core and content/regions. */
export function makeContent(): Content {
  return {
    region: { id: 'test_region', name: t('Тест', 'Test') },
    balance: balanceJson as unknown as Balance,
    boats: [{
      id: 'test_boat', name: t('Тест 40', 'Test 40'), lengthFt: 40, cabins: 3, berths: 6,
      waterTankL: 300, fuelTankL: 150, serviceBankAh: 110, serviceBanks: 2, starterSeparate: true,
      solarW: 0, electricToilet: false, motorKn: 6.5, hullSpeedKn: 7.5,
      priceEur: 4000, depositEur: 2000,
      shinyFeatures: [t('Подруливающее устройство', 'Bow thruster')],
      weakness: t('Слабое место', 'Weak spot'),
      defectsPerWeek: [2, 3],
      defectPool: [
        { id: 'worn_impeller', checkpoint: 'impeller', description: t('Изношенный импеллер', 'Worn impeller'), system: 'engine_cooling', fixEur: 60, fixMin: 20 },
        { id: 'toilet_valve', checkpoint: 'toilets', description: t('Клапан гальюна подтекает', 'The head valve leaks'), system: 'heads', fixEur: 40, fixMin: 15 },
        { id: 'old_scratch', checkpoint: 'damage_photos', description: t('Старая царапина', 'Old scratch'), chargedOnReturn: 'hull_scratch' },
      ],
      systems: { engine_cooling: 'ok', heads: 'ok', rig: 'ok', bow_thruster: 'worn' },
    }],
    systems: [
      { id: 'engine_cooling', name: t('Охлаждение', 'Cooling'), checkpoint: 'impeller', wearPer: { motor_hour: 1 }, failures: [], brokenEffect: { noMotor: true }, repairs: [{ id: 'service', label: t('Сервис', 'Service'), costEur: 100, timeHours: 2, requires: 'at_marina || moored_berth', restores: 'ok' }] },
      { id: 'heads', name: t('Гальюны', 'Heads'), checkpoint: 'toilets', wearPer: { night: 1 }, failures: [], brokenEffect: { dailyEffect: { mood: -8 } }, repairs: [{ id: 'service', label: t('Сервис', 'Service'), costEur: 90, timeHours: 2, requires: 'at_marina || moored_berth', restores: 'ok' }] },
      { id: 'rig', name: t('Такелаж', 'Rig'), checkpoint: 'sails', wearPer: { sail_hour: 1 }, failures: [], brokenEffect: { noSail: true }, repairs: [{ id: 'service', label: t('Сервис', 'Service'), costEur: 350, timeHours: 4, requires: 'at_marina || moored_berth', restores: 'ok' }] },
      { id: 'bow_thruster', name: t('Подруливающее', 'Bow thruster'), failures: [], brokenEffect: {}, repairs: [{ id: 'service', label: t('Сервис', 'Service'), costEur: 300, timeHours: 3, requires: 'at_marina || moored_berth', restores: 'ok' }] },
    ],
    map,
    routes: [
      { id: 'r_base_bay_a', from: 'base', to: 'bay_a', distanceNm: 10, kLocal: 1.0, features: ['open'] },
      { id: 'r_bay_a_marina_b', from: 'bay_a', to: 'marina_b', distanceNm: 8, kLocal: 1.3, features: ['strait'] },
      { id: 'r_marina_b_base', from: 'marina_b', to: 'base', distanceNm: 12.8, kLocal: 1.2, features: ['gulf'] },
    ],
    weather: [{
      id: 'test_week', name: t('Тестовая неделя', 'Test week'), afternoonFactor: 1.2,
      days: [1, 2, 3, 4, 5, 6].map((day) => ({ day, windKn: 12, gustKn: 18, dir: 'NW' as const, frontChance: day === 3 ? 0.5 : 0, barometerHpa: 1015 })),
    }],
    crew: [
      { id: 'party', role: 'guest', name: t('Тусовщик', 'Party guest'), names: [t('Аня', 'Anya'), t('Олег', 'Oleg'), t('Лена', 'Lena'), t('Паша', 'Pasha')], wishes: ['taverna', 'beach', 'swim'], seasickness: 0.3, patience: 0.4, promiseSensitivity: 1.2 },
      { id: 'sailor', role: 'sailor', name: t('Яхтсмен', 'Sailor'), names: [t('Ира', 'Ira'), t('Макс', 'Max'), t('Катя', 'Katya'), t('Глеб', 'Gleb')], wishes: ['sailing', 'early_start'], seasickness: 0.1, patience: 0.7, promiseSensitivity: 0.8 },
    ],
    briefing: ['sails', 'cleats', 'fenders', 'captain_only', 'anchor', 'loaded_lines', 'toilet', 'mob'].map((id) => ({
      id, title: t(`Тема ${id}`, `Topic ${id}`), description: t(`Описание ${id}`, `Description ${id}`),
    })),
    dialogues: [
      { id: 'early_try', contexts: ['briefing', 'morning', 'evening'], said: t('Постараемся выйти пораньше', "We'll try to leave early"), heard: t('Выходим в 8', 'We leave at 8'), strength: 0.9, expectation: { kind: 'depart_by', hour: 8 } },
      { id: 'ten_bonus', contexts: ['briefing', 'evening'], said: t('Выходим в 10, если получится раньше — бонус', "We leave at 10; earlier is a bonus"), heard: t('Выходим в 10', 'We leave at 10'), strength: 0.6, expectation: { kind: 'depart_by', hour: 10 } },
      { id: 'decide_morning', contexts: ['briefing', 'evening'], said: t('Решим утром по погоде', "We'll decide in the morning"), heard: t('Пока неясно', 'Not decided yet'), strength: 0.2, expectation: { kind: 'none' } },
      { id: 'promise_taverna', contexts: ['evening'], said: t('Завтра таверна', 'Taverna tomorrow'), heard: t('Завтра точно таверна', 'Taverna tomorrow for sure'), strength: 0.7, expectation: { kind: 'activity', activity: 'taverna' } },
    ],
    events: [{
      id: 'toilet_clog', pillar: 'boat',
      trigger: { phase: 'evening', conditions: ['day >= 3', '!checkin.toilets', '!briefing.toilet'], chance: 0.35 },
      scene: 'cabin_night',
      text: t('Из носового гальюна доносится крик. Насос не качает.', "A shout from the forward head. The pump won't move."),
      voices: [{ voice: 'mechanic', min_level: 2, text: t('Клапан забит. Это час работы и перчатки.', "Valve's clogged. An hour of work and gloves.") }],
      options: [
        { id: 'fix_self', text: t('Чинить самому', 'Fix it yourself'), check: { voice: 'mechanic', difficulty: 2 }, success: { fatigue: 15, mood: 5 }, fail: { fatigue: 25, mood: -10, damage: 'toilet_broken' } },
        { id: 'call_base', text: t('Звонить на базу', 'Call the base'), effects: { money: -80, time_hours: 4 } },
        { id: 'endure', text: t('Терпеть до марины', 'Put up with it until the marina'), effects: { mood_per_day: -8 } },
      ],
      debrief: t('Гальюны не проверены на приёмке и не было брифинга по их использованию.', 'Heads were not checked at check-in and the crew got no briefing on them.'),
    }],
    maneuvers: [{
      id: 'dep_test', kind: 'departure', title: t('Отход', 'Departure'),
      steps: [
        { id: 'neutral', text: t('Рычаг в нейтраль', 'Throttle to neutral') },
        { id: 'command_helm', text: t('Команда рулевому', 'Brief the helm') },
        { id: 'release_lines', text: t('Отдать швартовы', 'Release lines') },
        { id: 'engage_gear', text: t('Дать ход', 'Engage gear') },
      ],
      errors: [
        { id: 'release_before_neutral', wrongIf: { first: 'release_lines', then: 'neutral' }, effect: { damage: 'prop_line', mood: -5 }, injuryChance: 0, text: t('Швартов на винте', 'Line in the prop') },
        { id: 'release_before_command', wrongIf: { first: 'release_lines', then: 'command_helm' }, effect: { mood: -6, fatigue: 6 }, injuryChance: 0.2, mitigatedBy: 'briefing.loaded_lines', text: t('Конец вырвало из рук', 'Line ripped from hands') },
        { id: 'gear_before_release', wrongIf: { first: 'engage_gear', then: 'release_lines' }, effect: { damage: 'hull_scratch', mood: -8 }, injuryChance: 0, text: t('Удар о соседа', 'Hit the neighbour') },
      ],
    },
    ...(['mooring', 'anchoring', 'anchor_up'] as const).map((kind) => ({
      id: `${kind}_test`, kind, title: t(`Манёвр ${kind}`, `Maneuver ${kind}`),
      steps: [{ id: 'a', text: t('Шаг А', 'Step A') }, { id: 'b', text: t('Шаг Б', 'Step B') }],
      errors: [],
    }))],
    debrief: [{
      id: 'toilet_unchecked', pillar: 'boat', decision: 'checkin:skip:toilets', consequence: 'event:toilet_clog', priority: 5,
      text: t('Не проверили гальюны → засор на третий день.', 'Heads unchecked → clog on day three.'),
    }],
  };
}
