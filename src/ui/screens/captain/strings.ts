import type { PerkId } from '../../../engine';
import { dict, type Dict } from '../../i18n/t';

export const CAPTAIN = dict({
  title: { ru: 'Кто вы как капитан', en: 'What kind of skipper are you' },
  subtitle: { ru: 'Распределите очки по внутренним голосам. Прокачанный голос чаще говорит и видит больше.', en: 'Spread points across your inner voices. A trained voice speaks up more and notices more.' },
  remaining: { ru: 'Осталось очков: {n}', en: 'Points left: {n}' },
  raise: { ru: 'Прибавить: {voice}', en: 'Raise: {voice}' },
  lower: { ru: 'Убавить: {voice}', en: 'Lower: {voice}' },
  fixed: { ru: 'не прокачивается', en: 'cannot be trained' },
  fixedTitle: { ru: 'Эти голоса звучат всегда', en: 'These voices always speak' },
  perks: { ru: 'Что даёт этот уровень', en: 'What this level gives' },
  reset: { ru: 'Сбросить', en: 'Reset' },
});

export const PERKS: Dict<PerkId> = {
  risk_injury: { ru: 'Риск травм и поломок парусов {value}', en: 'Risk of injuries and torn sails {value}' },
  maneuver_time: { ru: 'Время манёвров {value}', en: 'Maneuver time {value}' },
  check_bonus: { ru: 'Шанс проверок {value}', en: 'Check chance {value}' },
  exact_gauges: { ru: 'Точные цифры на приборах', en: 'Exact gauge readings' },
  local_wind: { ru: 'Видит местный ветер', en: 'Reads the local wind' },
  front_signals: { ru: 'Замечает признаки фронта', en: 'Notices front signs' },
  front_chance: { ru: 'Шанс фронта числом', en: 'Front chance as a number' },
  front_timing: { ru: 'Час прихода фронта', en: 'Hour the front arrives' },
  promise_softening: { ru: 'Сорванное обещание: обида {value}', en: 'Broken promise: resentment {value}' },
  discount: { ru: 'Расходы {value}', en: 'Spending {value}' },
};

export const PERK_UI = dict({
  nextLevel: { ru: 'Ур. {n}: {perk}', en: 'Lv {n}: {perk}' },
});
