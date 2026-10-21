import type { BerthType, LocalizedText, Resources, Seabed, ShowerDiscipline } from '../../engine';
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
  marinaNoMoney: { ru: 'Марина: не хватило денег', en: 'Marina: not enough money' },
  towed: { ru: 'Буксир: {eur} €, +{hours} ч', en: 'Tow: €{eur}, +{hours} h' },
  marinaFee: { ru: 'Стоянка в марине: {eur} €', en: 'Marina fee: €{eur}' },
  swim: { ru: 'Остановка на купание', en: 'A swim stop' },
  swimSkipped: { ru: 'Купание отменили: уже темно', en: 'Swim cancelled: it is already dark' },
  taverna: { ru: 'Ужин в таверне', en: 'Dinner at a taverna' },
  rest: { ru: 'Отдых на стоянке, настроение {mood}', en: 'Rest at the anchorage, mood {mood}' },
  nightRolly: { ru: 'Ночь в болтанке', en: 'A rolly night' },
  nightArrival: { ru: 'Пришли в темноте', en: 'Arrived after dark' },
  sailOverpowered: { ru: 'Слишком много парусов: крен, экипаж укачало', en: 'Overpowered: heeling hard, the crew got seasick' },
  systemDaily: { ru: 'Неисправно: {system}', en: 'Out of order: {system}' },
  systemAnchor: { ru: '{system} сломано: якорь вручную', en: '{system} broken: anchoring by hand' },
  systemNoCook: { ru: 'Без газа не приготовить ужин', en: 'No cooking without gas' },
  systemNoMotor: { ru: 'Мотор не работает', en: 'The engine is out' },
  systemNoSail: { ru: 'Парусами идти нельзя', en: 'Cannot sail' },
  systemRepaired: { ru: 'Починили: {system}', en: 'Repaired: {system}' },
  systemRepairFailed: { ru: 'Починить не вышло: {system}', en: "Couldn't repair: {system}" },
  checkinFixed: { ru: 'Починили на базе: {what}', en: 'Fixed at base: {what}' },
  checkinSailOn: { ru: 'Идём с неисправностью: {what}', en: 'Sailing on with: {what}' },
  systemBroke: { ru: 'Сломалось: {system}', en: 'Broke down: {system}' },
  systemFault: { ru: 'Неисправность: {system}', en: 'Fault: {system}' },
  sailBreak: { ru: 'Порвали парус', en: 'Tore a sail' },
  sailReefUnderway: { ru: 'Брали риф на ходу в сильный ветер', en: 'Reefed underway in a strong wind' },
  moodPerDay: { ru: 'Бытовое неудобство: настроение {mood}', en: 'Daily discomfort: mood {mood}' },
  eventHappened: { ru: 'Событие: {text}', en: 'Event: {text}' },
  eventOption: { ru: 'Решение: {option}', en: 'Decision: {option}' },
  chose: { ru: 'Выбрали: {option}', en: 'Chose: {option}' },
  economistSaved: { ru: 'Экономист сэкономил {eur} €', en: 'The Economist saved {eur} €' },
  seaSenseFront: { ru: 'Чутьё моря: днём придёт фронт', en: 'Sea Sense: a front is coming this afternoon' },
  diplomatSoftened: { ru: 'Дипломат смягчил удар: +{mood} к настроению', en: 'The Diplomat softened the blow: +{mood} mood' },
  levelUp: { ru: '⬆ {voice} {from} → {to}', en: '⬆ {voice} {from} → {to}' },
  checkPassed: { ru: 'Проверка «{voice}» удалась (шанс {chance}%)', en: '{voice} check passed ({chance}% chance)' },
  checkFailed: { ru: 'Проверка «{voice}» провалилась (шанс {chance}%)', en: '{voice} check failed ({chance}% chance)' },
  xp: { ru: '+{xp} {voice} — {cause}', en: '+{xp} {voice} — {cause}' },
  xpPlain: { ru: '+{xp} {voice}', en: '+{xp} {voice}' },
  xpFault: { ru: 'неисправность: {system}', en: 'fault: {system}' },
  xpRepair: { ru: 'ремонт: {system}', en: 'repair: {system}' },
  xpCheck: { ru: 'проверка: {option}', en: 'check: {option}' },
  xpManeuverWrong: { ru: 'ошибка в манёвре «{title}»', en: 'mistake in "{title}"' },
  xpManeuverOk: { ru: 'чистый манёвр «{title}»', en: 'clean "{title}"' },
  rollFrontHit: { ru: 'Фронт пришёл (шанс {chance}%)', en: 'The front came (chance {chance}%)' },
  rollFrontMiss: { ru: 'Фронт обошёл стороной (шанс {chance}%)', en: 'The front passed by (chance {chance}%)' },
  rollAnchorHit: { ru: 'Якорь не схватил, попытка {n} (шанс {chance}%)', en: 'The anchor did not bite, attempt {n} ({chance}% chance)' },
  rollAnchorMiss: { ru: 'Якорь схватил, попытка {n} (шанс сорваться {chance}%)', en: 'The anchor bit, attempt {n} ({chance}% chance to drag)' },
  rollMarinaHit: { ru: 'В марине мест нет (шанс {chance}%)', en: 'No berths in the marina ({chance}% chance)' },
  rollMarinaMiss: { ru: 'В марине место нашлось (шанс отказа {chance}%)', en: 'The marina had a berth ({chance}% chance of refusal)' },
  rollSailHit: { ru: 'Парус не выдержал (шанс {chance}%)', en: 'The sail gave way ({chance}% chance)' },
  rollSailMiss: { ru: 'Парус выдержал (шанс порвать {chance}%)', en: 'The sail held ({chance}% chance to tear)' },
  rollInjuryHit: { ru: 'Травма (шанс {chance}%)', en: 'Someone got hurt ({chance}% chance)' },
  rollMarineroHit: { ru: 'Маринеро встретил на причале (шанс {chance}%)', en: 'A marinero met us on the quay ({chance}% chance)' },
  rollMarineroMiss: { ru: 'Маринеро не вышел — швартовались сами (шанс {chance}%)', en: 'No marinero came out — we tied up ourselves ({chance}% chance)' },
  rollInjuryMiss: { ru: 'Обошлось без травмы (шанс {chance}%)', en: 'No injury ({chance}% chance)' },
  returnOnTime: { ru: 'Вернулись на базу вовремя', en: 'Back at base on time' },
  returnLate: { ru: 'Не успели на базу к сроку', en: 'Missed the base deadline' },
  lateFee: { ru: 'Штраф за опоздание: {eur} €', en: 'Late return fee: €{eur}' },
  returnedBroken: { ru: 'Вернули сломанным: {system} — {eur} € из депозита', en: 'Returned broken: {system} — €{eur} from the deposit' },
  depositCharged: { ru: 'С депозита удержали: {what}', en: 'Deducted from the deposit: {what}' },
  unknown: { ru: 'Запись: {cause}', en: 'Entry: {cause}' },
});

export const CHANCE_PARTS = dict({
  base: { ru: 'база', en: 'base' },
  clamp: { ru: 'предел', en: 'limit' },
  difficulty: { ru: 'сложность', en: 'difficulty' },
  fatigue: { ru: 'усталость', en: 'fatigue' },
  mitigation: { ru: 'страховка', en: 'safeguards' },
  seabed: { ru: 'грунт', en: 'seabed' },
  wind: { ru: 'ветер', en: 'wind' },
  night: { ru: 'темнота', en: 'darkness' },
  briefing: { ru: 'брифинг', en: 'briefing' },
  late: { ru: 'опоздание', en: 'arriving late' },
  drama: { ru: 'драма', en: 'drama' },
  checkin: { ru: 'приёмка', en: 'check-in' },
  worn: { ru: 'износ', en: 'wear' },
  marinero: { ru: 'маринеро', en: 'marinero' },
  unknown: { ru: 'прочее', en: 'other' },
});

export const CHANCE_UI = dict({
  entry: { ru: '{label} {delta}', en: '{label} {delta}' },
});

export const SEABED_NAMES: Readonly<Record<Seabed, LocalizedText>> = {
  sand: t('песок', 'sand'),
  mud: t('ил', 'mud'),
  weed: t('водоросли', 'weed'),
  rock: t('камень', 'rock'),
};

export const BERTH_NAMES: Readonly<Record<BerthType, LocalizedText>> = {
  stern_to: t('Кормой (муринг)', 'Stern-to'),
  side_to: t('Лагом', 'Alongside'),
  anchor: t('На якоре', 'At anchor'),
  anchor_ashore: t('Якорь и кормовой на берег', 'Anchor + stern line ashore'),
};
