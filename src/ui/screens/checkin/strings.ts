import { dict } from '../../i18n/t';

export const CHECKIN = dict({
  title: { ru: 'Приёмка лодки', en: 'Boat check-in' },
  subtitle: { ru: 'Базовый менеджер торопится. Что проверите сами? Непроверенное останется сюрпризом.', en: 'The base manager is in a hurry. What will you check yourself? Whatever you skip stays a surprise.' },
  budget: { ru: 'Время на приёмку: {used} из {total} мин', en: 'Check-in time: {used} of {total} min' },
  cost: { ru: '{n} мин', en: '{n} min' },
  finish: { ru: 'Закончить приёмку', en: 'Finish check-in' },
  cutaway: { ru: 'Разрез яхты с точками проверки', en: 'Yacht cutaway with checkpoints' },
});

export const DEFECTS = dict({
  title: { ru: 'Найденные неисправности', en: 'Defects found' },
  subtitle: { ru: 'Это вы нашли сами. Исправить на базе можно за деньги и время, или выйти как есть.', en: 'You found these yourself. The base can fix them for money and time, or you can sail as she is.' },
  system: { ru: 'Система: {name}', en: 'System: {name}' },
  sailOn: { ru: 'Плыть так', en: 'Sail on' },
});
