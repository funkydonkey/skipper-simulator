import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../src/engine';
import { passageLines, todayTrail } from '../../../src/ui/screens/passage/timeline';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };

describe('PassageScreen', () => {
  it('replays the day on the chart and in the log, then moves on', async () => {
    const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false } });
    r.dispatch({ type: 'commit_plan', orders: {} });
    expect(r.currentScreen()).toBe('passage');
    expect(todayTrail(r.session().game!, content)).toEqual(['base_marina', 'cala_azzurra']);
    expect(screen.getByText(/Марина Порто-Кало \(база\) — Кала-Адзурра, на моторе/)).toBeInTheDocument();
    expect(screen.queryByText(/^Событие:/)).toBeNull();
    await r.user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(['evening', 'event']).toContain(r.currentScreen());
  });

  it('keeps xp and non-check rolls out of the passage timeline', () => {
    const base = gameAt('planning');
    const e = (cause: string, extra: Partial<LogEntry> = {}): LogEntry => ({ day: base.day, clockMin: 600, kind: 'info', cause, ...extra });
    const odds = { value: 0.3, parts: [{ source: 'base', delta: 0.3 }] };
    const game = {
      ...base,
      log: [e('plan:depart', { data: { hour: 9 } }), e('xp:order:order:ok:x', { data: { xp: 1 } }), e('roll:front:1', { kind: 'roll', odds, data: { hit: true } }), e('rest', { delta: { mood: 1 } })],
    };
    const causes = passageLines(game, content, 'ru').map((l) => l.cause);
    expect(causes).toEqual(['rest']);
  });
});
