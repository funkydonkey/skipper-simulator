import type { LocalizedText, Resources, ShowerDiscipline } from '../../engine';
import { dict } from '../i18n/t';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });

export const VIEW = dict({
  resources: { ru: 'Ресурсы', en: 'Resources' },
  damages: { ru: 'Повреждения: {list}', en: 'Damage: {list}' },
  noDamage: { ru: 'Повреждений нет', en: 'No damage' },
  at: { ru: '{place} · {clock}', en: '{place} · {clock}' },
});

export const RESOURCE_NAMES: Readonly<Record<keyof Resources, LocalizedText>> = {
  waterL: t('Вода', 'Water'),
  fuelL: t('Топливо', 'Fuel'),
  serviceBankPct: t('Сервисный банк', 'Service bank'),
  starterBankPct: t('Стартовый аккумулятор', 'Starter battery'),
  gasPct: t('Газ', 'Gas'),
  moneyEur: t('Деньги', 'Money'),
  mood: t('Настроение экипажа', 'Crew mood'),
  fatigue: t('Усталость капитана', 'Skipper fatigue'),
};

export const UNITS = dict({
  liters: { ru: ' л', en: ' L' },
});

export const SHOWER_NAMES: Readonly<Record<ShowerDiscipline, LocalizedText>> = {
  strict: t('строгий', 'strict'),
  normal: t('обычный', 'normal'),
  loose: t('свободный', 'relaxed'),
};

export const MODE_NAMES = dict({
  motor: { ru: 'на моторе', en: 'under engine' },
  sail: { ru: 'под парусом', en: 'under sail' },
});

/** Event signal ids (effect.signal in events.json). Unknown ids use LOG.signalGeneric. */
export const SIGNAL_NAMES: Readonly<Record<string, LocalizedText>> = {
  barometer: t('Барометр падал', 'The barometer was falling'),
  local_warning: t('Местные предупреждали о ветре', 'Locals warned about the wind'),
};

export const LOG = dict({
  boatChosen: { ru: 'Взяли лодку «{name}»', en: 'Took the boat "{name}"' },
  checked: { ru: 'На приёмке проверили: {what}', en: 'Checked at check-in: {what}' },
  skipped: { ru: 'На приёмке не проверили: {what}', en: 'Not checked at check-in: {what}' },
  defectFound: { ru: 'Нашли на приёмке: {what}', en: 'Found at check-in: {what}' },
  defectHidden: { ru: 'Скрытый дефект остался незамеченным: {what}', en: 'A hidden defect went unnoticed: {what}' },
  briefed: { ru: 'На брифинге обсудили: {what}', en: 'Briefed the crew on: {what}' },
  notBriefed: { ru: 'На брифинге не обсудили: {what}', en: 'Did not brief the crew on: {what}' },
  said: { ru: 'Сказали: «{said}». Экипаж услышал: «{heard}»', en: 'Said: "{said}". The crew heard: "{heard}"' },
  promiseKept: { ru: 'Ожидание выполнено: «{heard}»', en: 'Expectation met: "{heard}"' },
  promiseBroken: { ru: 'Ожидание сорвано: «{heard}»', en: 'Expectation broken: "{heard}"' },
  barometerOpen: { ru: 'Утром посмотрели на барометр и небо', en: 'Checked the barometer and the sky in the morning' },
  barometerIgnored: { ru: 'Утром на барометр не смотрели', en: 'Did not look at the barometer in the morning' },
  frontSignalSeen: { ru: 'Барометр падает ({trend} гПа), на западе тучи', en: 'Barometer falling ({trend} hPa), clouds to the west' },
  frontSignalMissed: { ru: 'Барометр падал, но этого никто не заметил', en: 'The barometer was falling, but nobody noticed' },
  signalGeneric: { ru: 'Признак: {id}', en: 'Sign: {id}' },
  frontArrived: { ru: 'Пришёл фронт: ветер {wind} уз', en: 'A front came through: wind {wind} kn' },
  departPlanned: { ru: 'План: выход в {time}', en: 'Plan: leave at {time}' },
  routeBusy: { ru: 'Насыщенный маршрут: {nm} миль, переходов: {legs}', en: 'A packed route: {nm} nm in {legs} legs' },
  routeEasy: { ru: 'Спокойный маршрут: {nm} миль, переходов: {legs}', en: 'An easy route: {nm} nm in {legs} legs' },
  reefs: { ru: 'Рифов взято: {n}', en: 'Reefs taken: {n}' },
  shower: { ru: 'Режим душа: {kind}', en: 'Shower discipline: {kind}' },
  autopilot: { ru: 'Автопилот на весь переход', en: 'Autopilot for the whole passage' },
  leg: { ru: '{route}, {mode}: ветер {wind} уз, ход {speed} уз, {hours} ч', en: '{route}, {mode}: wind {wind} kn, speed {speed} kn, {hours} h' },
  zeroStarter: { ru: 'Стартовый аккумулятор сел: прикурка и задержка', en: 'The starter battery was flat: jump start and a delay' },
  zeroFuel: { ru: 'Кончилось топливо', en: 'Ran out of fuel' },
  zeroWater: { ru: 'Кончилась вода', en: 'Ran out of water' },
  zeroService: { ru: 'Сервисный банк разряжен: тёплый холодильник, нет насоса', en: 'Service bank flat: warm fridge, no water pump' },
  zeroGas: { ru: 'Нет газа: холодный ужин', en: 'No gas: a cold dinner' },
  orderOk: { ru: 'Манёвр «{title}»: команды по порядку', en: 'Maneuver "{title}": commands in the right order' },
  orderWrong: { ru: 'Манёвр «{title}»: команды не по порядку', en: 'Maneuver "{title}": commands out of order' },
  injury: { ru: 'Травма в экипаже', en: 'A crew member was injured' },
  refillWater: { ru: 'Заправились водой', en: 'Filled up with water' },
  refillFuel: { ru: 'Заправились топливом', en: 'Filled up with fuel' },
  refillGas: { ru: 'Поменяли газовый баллон', en: 'Swapped the gas bottle' },
  anchorAttempts: { ru: 'Якорь встал, попыток: {n}', en: 'Anchor set after {n} attempt(s)' },
  anchorDragging: { ru: 'Якорь ползёт: ночь без сна', en: 'The anchor dragged: a sleepless night' },
  marinaRefused: { ru: 'Марина отказала: мест нет', en: 'The marina turned us away: no berths' },
  marinaFee: { ru: 'Стоянка в марине: {eur} €', en: 'Marina fee: €{eur}' },
  swim: { ru: 'Остановка на купание', en: 'A swim stop' },
  swimSkipped: { ru: 'Купание отменили: уже темно', en: 'Swim cancelled: it is already dark' },
  taverna: { ru: 'Ужин в таверне', en: 'Dinner at a taverna' },
  rest: { ru: 'Отдых на стоянке, настроение {mood}', en: 'Rest at the anchorage, mood {mood}' },
  nightRolly: { ru: 'Ночь в болтанке', en: 'A rolly night' },
  nightArrival: { ru: 'Пришли в темноте', en: 'Arrived after dark' },
  sailOverpowered: { ru: 'Слишком много парусов: крен, экипаж укачало', en: 'Overpowered: heeling hard, the crew got seasick' },
  sailBreak: { ru: 'Порвали парус', en: 'Tore a sail' },
  sailReefUnderway: { ru: 'Брали риф на ходу в сильный ветер', en: 'Reefed underway in a strong wind' },
  moodPerDay: { ru: 'Бытовое неудобство: настроение {mood}', en: 'Daily discomfort: mood {mood}' },
  eventHappened: { ru: 'Событие: {text}', en: 'Event: {text}' },
  eventOption: { ru: 'Решение: {option}', en: 'Decision: {option}' },
  chose: { ru: 'Выбрали: {option}', en: 'Chose: {option}' },
  checkPassed: { ru: 'Проверка «{voice}» удалась (шанс {chance}%)', en: '{voice} check passed ({chance}% chance)' },
  checkFailed: { ru: 'Проверка «{voice}» провалилась (шанс {chance}%)', en: '{voice} check failed ({chance}% chance)' },
  returnOnTime: { ru: 'Вернулись на базу вовремя', en: 'Back at base on time' },
  returnLate: { ru: 'Не успели на базу к сроку', en: 'Missed the base deadline' },
  lateFee: { ru: 'Штраф за опоздание: {eur} €', en: 'Late return fee: €{eur}' },
  depositCharged: { ru: 'С депозита удержали: {what}', en: 'Deducted from the deposit: {what}' },
  unknown: { ru: 'Запись: {cause}', en: 'Entry: {cause}' },
});
