import { formatClock, type Lang } from '../../engine';

const MIN_PER_HOUR = 60;

export const formatHour = (hour: number): string => formatClock(Math.round(hour * MIN_PER_HOUR));

const UNITS: Record<Lang, { h: string; min: string }> = { ru: { h: 'ч', min: 'мин' }, en: { h: 'h', min: 'min' } };

/** A span of time as people say it: "45 мин" under an hour, otherwise "2 ч" or "1 ч 30 мин". */
export function formatDuration(hours: number, lang: Lang): string {
  const total = Math.max(0, Math.round(hours * MIN_PER_HOUR));
  const h = Math.floor(total / MIN_PER_HOUR);
  const min = total % MIN_PER_HOUR;
  const u = UNITS[lang];
  if (h === 0) return `${min} ${u.min}`;
  return min === 0 ? `${h} ${u.h}` : `${h} ${u.h} ${min} ${u.min}`;
}

/** One decimal, explicit sign: "+5", "−2.5" (true minus sign for typography). */
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r > 0) return `+${r}`;
  return r < 0 ? `−${Math.abs(r)}` : '0';
}

/** One decimal at most, trailing zero dropped: 7.6, 8. */
export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** A euro amount with at most two decimals, in the reader's decimal mark: "80,8" (ru), "80.8" (en). */
export function money(eur: number, lang: Lang): string {
  const s = String(Math.round(eur * 100) / 100);
  return lang === 'ru' ? s.replace('.', ',') : s;
}
