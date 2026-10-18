import type { GameState, LogEntry } from './types';

export type NewLogEntry = Omit<LogEntry, 'day' | 'clockMin'>;

export function appendLog(state: GameState, entry: NewLogEntry): GameState {
  return { ...state, log: [...state.log, { ...entry, day: state.day, clockMin: state.clockMin }] };
}

/** Segment-aware prefix match: `event:a` matches `event:a` and `event:a:x`, not `event:ab`. */
export function causeMatches(cause: string, pattern: string): boolean {
  return cause === pattern || cause.startsWith(`${pattern}:`);
}

export function findLog(log: readonly LogEntry[], pattern: string): LogEntry[] {
  return log.filter((e) => causeMatches(e.cause, pattern));
}
