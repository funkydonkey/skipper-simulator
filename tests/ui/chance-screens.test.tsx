import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { ChanceBadge } from '../../src/ui/components/ChanceBadge';
import { content, gameAt, withEvent } from './fixtures';
import { renderShell, renderWithSession } from './render';

/** React reports bad DOM nesting and duplicate keys through console.error; a ChanceBadge in the wrong parent does exactly that. */
const DOM_WARNING = /cannot be a descendant|cannot contain a nested|same key|Warning:/;

let errorSpy: MockInstance<typeof console.error>;
beforeEach(() => { errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { errorSpy.mockRestore(); });

const domWarnings = (): string[] => errorSpy.mock.calls.map((args) => args.map(String).join(' ')).filter((m) => DOM_WARNING.test(m));
const openBadges = async (r: ReturnType<typeof renderShell>, root: HTMLElement = document.body): Promise<number> => {
  const badges = within(root).queryAllByRole('button', { expanded: false }).filter((b) => /\d+%$/.test(b.textContent ?? ''));
  for (const b of badges) await r.user.click(b);
  return badges.length;
};

describe('screens with chance badges render without DOM warnings', () => {
  it('planning preview', async () => {
    const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
    await r.user.click(screen.getByRole('button', { name: /^Кала-Адзурра/ }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    expect(await openBadges(r)).toBeGreaterThan(0);
    expect(domWarnings()).toEqual([]);
  });

  it('maneuvers', async () => {
    const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
    const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal', autopilot: false } });
    expect(r.currentScreen()).toBe('maneuvers');
    await openBadges(r);
    expect(domWarnings()).toEqual([]);
  });

  it('event with checks', async () => {
    const checkEvent = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => o.check && !o.requires))!;
    const r = renderShell(withEvent(gameAt('evening'), checkEvent.id));
    expect(await openBadges(r)).toBeGreaterThan(0);
    expect(domWarnings()).toEqual([]);
  });

  it('logbook drawer', async () => {
    const r = renderShell(gameAt('evening'));
    await r.user.click(screen.getByRole('button', { name: 'Бортжурнал' }));
    expect(await openBadges(r, screen.getByRole('dialog', { name: 'Бортжурнал' }))).toBeGreaterThan(0);
    expect(domWarnings()).toEqual([]);
  });

  it('the guard catches a badge nested in a paragraph', () => {
    renderWithSession(<p><ChanceBadge odds={{ value: 0.5, parts: [{ source: 'base', delta: 0.5 }] }} /></p>, gameAt('planning'));
    expect(domWarnings().length).toBeGreaterThan(0);
  });
});
