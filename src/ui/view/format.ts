import { formatClock } from '../../engine';

const MIN_PER_HOUR = 60;

export const formatHour = (hour: number): string => formatClock(Math.round(hour * MIN_PER_HOUR));

/** One decimal, explicit sign: "+5", "−2.5" (true minus sign for typography). */
export function signed(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r > 0) return `+${r}`;
  return r < 0 ? `−${Math.abs(r)}` : '0';
}
