import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../src/engine';
import { runWeek } from '../../../src/sim/run';
import { expert, newbie } from '../../../src/sim/strategies';
import { describeEntry, isNoise, logbookDays } from '../../../src/ui/view/logbook';
import { content } from '../fixtures';

const entry = (cause: string, extra: Partial<LogEntry> = {}): LogEntry => ({ day: 2, clockMin: 600, kind: 'decision', cause, ...extra });

describe('logbook', () => {
  it('describes every entry of real weeks in both languages without raw placeholders', () => {
    for (const strategy of [expert, newbie]) {
      for (const seed of [1, 2, 3, 42]) {
        const { state } = runWeek(content, seed, strategy);
        for (const e of state.log) {
          for (const lang of ['ru', 'en'] as const) {
            const line = describeEntry(e, content, lang);
            if (!line) continue;
            expect(line.text, e.cause).not.toMatch(/\{\w+\}|undefined|NaN/);
            expect(line.text.length, e.cause).toBeGreaterThan(3);
            expect(line.text, `no describer for ${e.cause}`).not.toMatch(/^(Запись|Entry):/);
          }
        }
      }
    }
  });

  it('shows what was said and what the crew heard', () => {
    const line = describeEntry(entry('dialogue:early_try'), content, 'ru')!;
    expect(line.text).toContain('Постараемся выйти пораньше');
    expect(line.text).toContain('Выходим в 8');
  });

  it('hides unseen front signals and hidden defects from the in-game logbook, but still describes them', () => {
    const unseen = entry('signal:front', { kind: 'signal', data: { seen: false, barometerTrendHpa: -4, frontAddKn: 10 } });
    expect(isNoise(unseen)).toBe(true);
    expect(describeEntry(unseen, content, 'ru')).not.toBeNull();
    expect(isNoise({ ...unseen, data: { seen: true, barometerTrendHpa: -4, frontAddKn: 10 } })).toBe(false);
    expect(isNoise(entry('defect:hidden:worn_impeller', { kind: 'info' }))).toBe(true);
    expect(isNoise(entry('checkin:skip:toilets'))).toBe(true);
    expect(describeEntry(entry('checkin:skip:toilets'), content, 'en')!.text).toContain('Heads');
  });

  it('marks good and bad outcomes', () => {
    expect(describeEntry(entry('promise:early_try:broken', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
    expect(describeEntry(entry('promise:early_try:kept', { kind: 'effect' }), content, 'ru')!.tone).toBe('good');
    expect(describeEntry(entry('marina:refused', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
  });

  it('groups the visible log by day', () => {
    const { state } = runWeek(content, 42, expert);
    const days = logbookDays(state.log, content, 'ru');
    expect(days.map((d) => d.day)).toEqual([...new Set(days.map((d) => d.day))].sort((a, b) => a - b));
    expect(days.every((d) => d.lines.length > 0)).toBe(true);
  });
});
