import type { LogEntry, Resources } from '../../../engine';

export function sumDeltas(entries: readonly LogEntry[]): Partial<Record<keyof Resources, number>> {
  const sum: Partial<Record<keyof Resources, number>> = {};
  for (const e of entries) {
    for (const [k, v] of Object.entries(e.delta ?? {}) as [keyof Resources, number][]) sum[k] = (sum[k] ?? 0) + v;
  }
  return Object.fromEntries(Object.entries(sum).filter(([, v]) => Math.round(v * 10) !== 0));
}

export function timeSpentHours(entries: readonly LogEntry[]): number {
  return entries.reduce((h, e) => h + Number(e.data?.time_hours ?? 0), 0);
}
