import { dict } from '../../i18n/t';

export const EVENT = dict({
  when: { ru: 'День {day} · {clock}', en: 'Day {day} · {clock}' },
  check: { ru: '[{voice} · {pct}%]', en: '[{voice} · {pct}%]' },
  unavailable: { ru: '(недоступно)', en: '(not available)' },
  outcomeTitle: { ru: 'Последствия', en: 'What came of it' },
  changes: { ru: 'Изменения', en: 'Changes' },
  noChanges: { ru: 'Ресурсы не изменились.', en: 'No change to resources.' },
  timeSpent: { ru: 'Ушло времени: {h} ч', en: 'Time spent: {h} h' },
});
