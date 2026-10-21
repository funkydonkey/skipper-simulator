import type { CheckpointId, Content, Lang, LocalizedText, Pillar, PointKind, VoiceId } from '../../engine';

const t = (ru: string, en: string): LocalizedText => ({ ru, en });

export const VOICE_NAMES: Readonly<Record<VoiceId, LocalizedText>> = {
  sea_sense: t('Морское чутьё', 'Sea Sense'),
  caution: t('Осторожность', 'Caution'),
  order: t('Порядок', 'Order'),
  mechanic: t('Механик', 'Mechanic'),
  diplomat: t('Дипломат', 'Diplomat'),
  economist: t('Экономист', 'Economist'),
  pride: t('Гордость', 'Pride'),
  crew_voice: t('Голос экипажа', "Crew's Voice"),
};

export const VOICE_HINTS: Readonly<Record<VoiceId, LocalizedText>> = {
  sea_sense: t('Читает погоду, барометр и защищённость бухт. Видит скрытые признаки фронта.', 'Reads weather, the barometer and how sheltered a bay is. Spots hidden signs of a front.'),
  caution: t('Призывает рифиться, ждать и проверять. Снижает риск, но тянет время.', 'Urges you to reef, wait and double-check. Lowers risk but costs time.'),
  order: t('Требует дисциплины команд и безопасности. Помогает на швартовках и якоре.', 'Demands clear commands and safety. Helps at moorings and anchoring.'),
  mechanic: t('Понимает электрику, воду и двигатель. Даёт точные цифры вместо «примерно».', 'Knows the electrics, water and engine. Gives exact numbers instead of rough guesses.'),
  diplomat: t('Знает, как говорить с экипажем и маринерами. Смягчает сорванные ожидания.', 'Knows how to talk to the crew and marineros. Softens broken expectations.'),
  economist: t('«Марина дорогая, бухта бесплатно». Ложный голос, иногда прав.', '"Marinas are pricey, bays are free." A false voice that is sometimes right.'),
  pride: t('«Не позорься перед экипажем». Ложный голос: толкает к риску.', '"Don\'t embarrass yourself in front of the crew." A false voice that pushes you to take risks.'),
  crew_voice: t('Желания гостей: пляж, таверна, ранний выход. Отражает настроение.', 'What the guests want: beach, taverna, an early start. Mirrors their mood.'),
};

export const PILLAR_NAMES: Readonly<Record<Pillar, LocalizedText>> = {
  weather: t('Погода', 'Weather'),
  time: t('Время', 'Time'),
  briefing: t('Брифинг', 'Briefing'),
  promises: t('Ожидания', 'Expectations'),
  safety: t('Безопасность', 'Safety'),
  boat: t('Лодка и ресурсы', 'Boat & resources'),
};

export const CHECKPOINT_NAMES: Readonly<Record<CheckpointId, LocalizedText>> = {
  anchor: t('Якорь и цепь', 'Anchor and chain'),
  impeller: t('Импеллер', 'Impeller'),
  gas: t('Газ', 'Gas'),
  toilets: t('Гальюны', 'Heads'),
  sails: t('Паруса', 'Sails'),
  electrics: t('Схема электрики', 'Wiring diagram'),
  damage_photos: t('Фото повреждений', 'Damage photos'),
};

export const POINT_KIND_NAMES: Readonly<Record<PointKind, LocalizedText>> = {
  base: t('База', 'Base'),
  marina: t('Марина', 'Marina'),
  bay: t('Бухта', 'Bay'),
  quay: t('Городской причал', 'Town quay'),
};

/** Damage ids from balance.deposit.damageCostEur. Unknown ids fall back to the id itself. */
export const DAMAGE_NAMES: Readonly<Record<string, LocalizedText>> = {
  sail_torn: t('Порван парус', 'Torn sail'),
  toilet_broken: t('Сломан гальюн', 'Broken head'),
  prop_line: t('Конец на винте', 'Line round the prop'),
  hull_scratch: t('Царапина на корпусе', 'Scratched hull'),
  impeller: t('Сгорел импеллер', 'Burnt-out impeller'),
  anchor_lost: t('Потерян якорь', 'Lost anchor'),
};

/** Scene ids from events.json plus `marina_dawn` for the main menu. */
export const SCENE_TITLES: Readonly<Record<string, LocalizedText>> = {
  marina_dawn: t('Марина на рассвете', 'Marina at dawn'),
  anchorage_day: t('Стоянка на якоре, день', 'At anchor, daytime'),
  anchorage_night: t('Стоянка на якоре, ночь', 'At anchor, night'),
  anchorage_sunset: t('Закат на якоре', 'Sunset at anchor'),
  bay_lunch: t('Обед в бухте', 'Lunch in the bay'),
  bow_anchor: t('На баке у якоря', 'At the bow anchor'),
  cabin_day: t('Каюта днём', 'Cabin by day'),
  cabin_night: t('Каюта ночью', 'Cabin at night'),
  cockpit_morning: t('Кокпит утром', 'Cockpit in the morning'),
  deck_spray: t('Брызги на палубе', 'Spray on deck'),
  deck_squall: t('Шквал', 'Squall'),
  deck_winch: t('У лебёдки', 'At the winch'),
  deck_wind: t('Ветер на палубе', 'Wind on deck'),
  dusk_harbour: t('Гавань в сумерках', 'Harbour at dusk'),
  engine_bay: t('Моторный отсек', 'Engine bay'),
  fuel_dock: t('Заправочный причал', 'Fuel dock'),
  galley: t('Камбуз', 'Galley'),
  marina_berth: t('Место в марине', 'Marina berth'),
  marina_entrance: t('Вход в марину', 'Marina entrance'),
  quay_morning: t('Причал утром', 'Quay in the morning'),
};

/** Glossary lookup with a visible fallback for ids the glossary does not know yet. */
export function label(table: Readonly<Record<string, LocalizedText>>, id: string, lang: Lang): string {
  return table[id]?.[lang] ?? id.replace(/_/g, ' ');
}

/** System names live in content.systems; this is the only lookup so nothing is duplicated. Unknown ids fall back to the id. */
export function systemName(content: Content, id: string, lang: Lang): string {
  return content.systems.find((s) => s.id === id)?.name[lang] ?? id;
}
