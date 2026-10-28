import { dict } from '../../i18n/t';

export const CHECKIN = dict({
  title: { ru: 'Приёмка лодки', en: 'Boat check-in' },
  subtitle: { ru: 'Базовый менеджер торопится. Что проверите сами? Непроверенное останется сюрпризом.', en: 'The base manager is in a hurry. What will you check yourself? Whatever you skip stays a surprise.' },
  budget: { ru: 'Время на приёмку: {used} из {total} мин', en: 'Check-in time: {used} of {total} min' },
  cost: { ru: '{n} мин', en: '{n} min' },
  repairTime: { ru: 'Найденное на базе чинят из этого же времени — оставьте запас: самый быстрый ремонт занимает {n} мин.', en: 'Base repairs of what you find come out of this same time, so leave some spare: the quickest fix takes {n} min.' },
  repairTimeAny: { ru: 'Найденное на базе чинят из этого же времени — оставьте запас.', en: 'Base repairs of what you find come out of this same time, so leave some spare.' },
  finish: { ru: 'Закончить приёмку', en: 'Finish check-in' },
  cutaway: { ru: 'Разрез яхты с точками проверки', en: 'Yacht cutaway with checkpoints' },
});

export const DEFECTS = dict({
  title: { ru: 'Найденные неисправности', en: 'Defects found' },
  subtitle: { ru: 'Это вы нашли сами. Исправить на базе можно за деньги и время, или выйти как есть.', en: 'You found these yourself. The base can fix them for money and time, or you can sail as she is.' },
  system: { ru: 'Система: {name}', en: 'System: {name}' },
  fix: { ru: 'Чинить на базе — {eur} €, {min} мин', en: 'Fix at base — €{eur}, {min} min' },
  sailOn: { ru: 'Плыть так', en: 'Sail on' },
  asIs: { ru: 'как есть', en: 'as is' },
  noMoney: { ru: 'не хватает денег', en: 'not enough money' },
  noTime: { ru: 'не хватает времени', en: 'not enough time' },
  minutesLeft: { ru: 'Осталось времени: {n} мин', en: 'Time left: {n} min' },
  confirm: { ru: 'Подтвердить', en: 'Confirm' },
});
