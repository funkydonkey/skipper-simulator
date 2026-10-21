import { dict } from '../../i18n/t';

export const MANEUVERS = dict({
  title: { ru: 'Команды на манёвры', en: 'Commands for the maneuvers' },
  subtitle: { ru: 'В каком порядке вы отдадите команды? Нажимайте шаги по очереди.', en: 'In what order will you give the commands? Tap the steps one by one.' },
  fallback: { ru: 'Если в марине не будет мест', en: 'If the marina has no berths' },
  risk: { ru: 'Если ошибёшься — риск травмы до', en: 'If you get it wrong — injury risk up to' },
  pool: { ru: 'Шаги', en: 'Steps' },
  order: { ru: 'Ваш порядок', en: 'Your order' },
  remove: { ru: 'Убрать: {step}', en: 'Remove: {step}' },
  last: { ru: 'Как в прошлый раз', en: 'Same as last time' },
  filled: { ru: 'Подставил {n} из {m} шагов — обстановка другая', en: 'Filled {n} of {m} steps — the situation changed' },
  hint: { ru: 'Порядок подсказывает: {step}', en: 'Order suggests: {step}' },
  back: { ru: 'Назад к плану', en: 'Back to the plan' },
  done: { ru: 'Готово', en: 'Done' },
});

export const SITUATION = dict({
  title: { ru: 'Обстановка на месте', en: 'Conditions on arrival' },
  forecast: { ru: 'Прогноз — на месте может отличаться', en: 'Forecast — may differ on arrival' },
  berth: { ru: 'Стоянка', en: 'Berth' },
  wind: { ru: 'Ветер', en: 'Wind' },
  windLine: { ru: '{side}, {kn} уз, {dir}', en: '{side}, {kn} kn, {dir}' },
  side_port: { ru: 'ветер в борт слева', en: 'wind on the port side' },
  side_starboard: { ru: 'ветер в борт справа', en: 'wind on the starboard side' },
  side_bow: { ru: 'ветер в нос', en: 'wind on the bow' },
  side_stern: { ru: 'ветер в корму', en: 'wind from astern' },
  side_none: { ru: 'штиль', en: 'calm' },
  marinero: { ru: 'Маринеро', en: 'Marinero' },
  marineroChance: { ru: 'маринеро:', en: 'marinero:' },
  marineroYes: { ru: 'маринеро есть', en: 'a marinero is there' },
  marineroNo: { ru: 'маринеро нет', en: 'no marinero' },
  place: { ru: 'Место', en: 'Place' },
  seabed: { ru: 'грунт: {name}', en: 'seabed: {name}' },
  tight: { ru: 'тесно', en: 'tight' },
  roomy: { ru: 'просторно', en: 'roomy' },
});
