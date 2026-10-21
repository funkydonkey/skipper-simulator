import type { EngineErrorCode } from '../../engine';
import { dict, type Dict } from './t';

export const COMMON = dict({
  appTitle: { ru: 'Симулятор шкипера', en: 'Skipper Simulator' },
  next: { ru: 'Дальше', en: 'Next' },
  back: { ru: 'Назад', en: 'Back' },
  confirm: { ru: 'Подтвердить', en: 'Confirm' },
  day: { ru: 'День {n}', en: 'Day {n}' },
  dayOf: { ru: 'День {n} из {total}', en: 'Day {n} of {total}' },
  errorPrefix: { ru: 'Не получилось: {message}', en: 'That did not work: {message}' },
  dismiss: { ru: 'Закрыть', en: 'Dismiss' },
  logbook: { ru: 'Бортжурнал', en: 'Logbook' },
  menu: { ru: 'В меню', en: 'Menu' },
  stub: { ru: 'Экран в разработке', en: 'Screen under construction' },
  hours: { ru: '{n} ч', en: '{n} h' },
  minutes: { ru: '{n} мин', en: '{n} min' },
  knots: { ru: '{n} уз', en: '{n} kn' },
  miles: { ru: '{n} миль', en: '{n} nm' },
  euro: { ru: '{n} €', en: '€{n}' },
});

/** What an engine rejection means for the player; the raw English message stays a debug detail. */
export const ENGINE_ERRORS: Dict<EngineErrorCode> = {
  WRONG_PHASE: { ru: 'сейчас этого сделать нельзя', en: 'this is not possible right now' },
  PENDING_EVENT: { ru: 'сначала разберитесь с текущим событием', en: 'deal with the current event first' },
  INVALID_INPUT: { ru: 'такой выбор не подходит', en: 'that choice is not allowed' },
  NOT_FOUND: { ru: 'в данных игры чего-то не хватает', en: 'something is missing from the game data' },
  BUDGET: { ru: 'не хватает денег или времени', en: 'not enough money or time' },
  CONTENT: { ru: 'ошибка в данных игры', en: 'the game data has an error' },
  NOT_BROKEN: { ru: 'эта система исправна', en: 'that system is not broken' },
  REPAIR_UNAVAILABLE: { ru: 'здесь так починить нельзя', en: 'this repair is not possible here' },
  NO_MONEY: { ru: 'не хватает денег', en: 'not enough money' },
};
