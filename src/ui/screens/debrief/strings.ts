import type { LocalizedText } from '../../../engine';
import { dict } from '../../i18n/t';

export const DEBRIEF = dict({
  title: { ru: 'Разбор недели', en: 'Week debrief' },
  subtitle: { ru: 'Бортжурнал с пометками капитана-наставника', en: 'The logbook, annotated by a mentor skipper' },
  safety: { ru: 'Безопасность', en: 'Safety' },
  crew: { ru: 'Экипаж', en: 'Crew' },
  boat: { ru: 'Лодка', en: 'Boat' },
  schedule: { ru: 'Расписание', en: 'Schedule' },
  gradeGood: { ru: 'Оценка: хорошо', en: 'Grade: good' },
  gradeOk: { ru: 'Оценка: так себе', en: 'Grade: so-so' },
  gradeBad: { ru: 'Оценка: плохо', en: 'Grade: bad' },
  noInjuries: { ru: 'Никто не пострадал', en: 'Nobody got hurt' },
  injuries: { ru: 'Травм: {n}', en: 'Injuries: {n}' },
  mood: { ru: 'Настроение в конце: {n}/100', en: 'Final mood: {n}/100' },
  deposit: { ru: 'Депозит: вернули {returned} €, удержали {loss} €', en: 'Deposit: €{returned} back, €{loss} kept' },
  onTime: { ru: 'Вернулись вовремя', en: 'Back on time' },
  late: { ru: 'Опоздали к сдаче', en: 'Late for handover' },
  links: { ru: 'Что решило неделю', en: 'What decided the week' },
  decision: { ru: 'Решение', en: 'Decision' },
  consequence: { ru: 'Последствие', en: 'Consequence' },
  signal: { ru: 'Сигнал, который был', en: 'The sign that was there' },
  stamp: { ru: 'день {day}, {clock}', en: 'day {day}, {clock}' },
  notes: { ru: 'Ещё заметки на полях', en: 'More notes in the margin' },
  voices: { ru: 'Голоса недели', en: 'Voices of the week' },
  levelRange: { ru: 'уровень {from} → {to}', en: 'level {from} → {to}' },
  xpFrom: { ru: 'Опыт:', en: 'XP:' },
  impactRiskCut: { ru: 'снизила риск на {n} п.п. в {k} бросках', en: 'cut risk by {n} pp over {k} rolls' },
  impactRiskUp: { ru: 'подняла риск на {n} п.п. в {k} бросках', en: 'raised risk by {n} pp over {k} rolls' },
  impactChecks: { ru: 'проверки: {n} из {m}', en: 'checks: {n} of {m}' },
  impactSaved: { ru: 'сэкономил {n} €', en: 'saved €{n}' },
  impactFront: { ru: 'предупредило о фронте, дни: {days}', en: 'warned of a front, days: {days}' },
  impactSoftened: { ru: 'смягчил обиды на {n}', en: 'softened grudges by {n}' },
  replay: { ru: 'Сыграть ту же неделю', en: 'Replay the same week' },
  newWeek: { ru: 'Новая неделя', en: 'New week' },
});

/** Labels for the xp cause roots the engine reports (`roll:check`, `order:wrong`, `order:ok`). */
export const XP_ROOTS: Readonly<Record<string, LocalizedText>> = {
  'roll:check': { ru: 'проверки', en: 'checks' },
  'order:wrong': { ru: 'ошибки в манёврах', en: 'maneuver mistakes' },
  'order:ok': { ru: 'чистые манёвры', en: 'clean maneuvers' },
};
