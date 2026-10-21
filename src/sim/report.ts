import { formatClock } from '../engine/time';
import type { Content, Lang } from '../engine/types';
import type { WeekResult } from './run';

const L = {
  ru: { day: 'День', scales: { safety: 'Безопасность', crew: 'Экипаж', boat: 'Лодка', schedule: 'Расписание', budget: 'Бюджет' }, deposit: 'Депозит возвращён', links: 'Связи' },
  en: { day: 'Day', scales: { safety: 'Safety', crew: 'Crew', boat: 'Boat', schedule: 'Schedule', budget: 'Budget' }, deposit: 'Deposit returned', links: 'Links' },
} as const;

export function formatWeek(result: WeekResult, content: Content, lang: Lang): string {
  const t = L[lang];
  const lines: string[] = [];
  const days = [...new Set(result.state.log.map((e) => e.day))].filter((d) => d >= 1);
  for (const day of days) {
    lines.push(`\n${t.day} ${day}`);
    for (const e of result.state.log.filter((x) => x.day === day && (x.kind === 'event' || x.kind === 'signal' || x.delta || x.data?.damage || x.data?.injury))) {
      const ev = e.kind === 'event' ? content.events.find((x) => `event:${x.id}` === e.cause) : undefined;
      const delta = e.delta ? ` ${JSON.stringify(e.delta)}` : '';
      lines.push(`  ${formatClock(e.clockMin)} ${e.cause}${delta}${ev ? ` — ${ev.text[lang]}` : ''}`);
    }
  }
  const d = result.debrief;
  lines.push('');
  for (const [k, g] of Object.entries(d.scales)) lines.push(`${t.scales[k as keyof typeof t.scales]}: ${g}`);
  lines.push(`${t.deposit}: ${d.depositReturnedEur} €`);
  lines.push(`${t.links}:`);
  for (const l of d.links) lines.push(`  • ${l.text[lang]}`);
  for (const n of d.eventNotes) lines.push(`  • ${n[lang]}`);
  return lines.join('\n');
}
