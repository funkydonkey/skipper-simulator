import { dict } from '../../i18n/t';

export const EVENING = dict({
  title: { ru: 'Вечер, день {n}', en: 'Evening, day {n}' },
  subtitle: { ru: '{place} · {clock}', en: '{place} · {clock}' },
  arrived: { ru: 'Пришли в {time}', en: 'Arrived at {time}' },
  stayed: { ru: 'День провели на месте', en: 'Spent the day in place' },
  atAnchor: { ru: 'стоим на якоре', en: 'at anchor' },
  atBerth: { ru: 'стоим у причала', en: 'alongside' },
  dinner: { ru: 'Ужин', en: 'Dinner' },
  cook: { ru: 'Готовим на борту', en: 'Cook on board' },
  noGas: { ru: 'Газа почти нет: ужин будет холодным', en: 'Almost out of gas: dinner will be cold' },
  taverna: { ru: 'Таверна · {eur} €', en: 'Taverna · €{eur}' },
  noMoney: { ru: 'нет денег', en: 'no money' },
  noTaverna: { ru: 'Таверны здесь нет', en: 'No taverna here' },
  tavernaClosed: { ru: 'Таверна уже закрыта (до {time})', en: 'The taverna has closed (open until {time})' },
  noCook: { ru: 'Газ сломан: на борту не приготовить', en: 'The gas is broken: no cooking on board' },
  say: { ru: 'Что сказать на завтра', en: 'What to say about tomorrow' },
  sayNothing: { ru: 'Ничего не обещать', en: 'Promise nothing' },
  heard: { ru: 'Экипаж услышал: «{heard}»', en: 'The crew heard: "{heard}"' },
  learned: { ru: 'Чему научил день', en: 'What today taught you' },
  sleep: { ru: 'Отбой', en: 'Lights out' },
});

export const REPAIR = dict({
  title: { ru: 'Ремонт', en: 'Repairs' },
  cost: { ru: '{eur} €', en: '€{eur}' },
  requires: { ru: 'только в марине', en: 'marina only' },
  no_money: { ru: 'нет денег', en: 'no money' },
});
