import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MORNING } from '../../../src/ui/screens/morning/strings';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('LogbookDrawer', () => {
  it('opens the logbook with entries by day and closes on Escape', async () => {
    const r = renderShell(gameAt('evening'));
    await r.user.click(screen.getByRole('button', { name: 'Бортжурнал' }));
    const dialog = screen.getByRole('dialog', { name: 'Бортжурнал' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'День 1' })).toBeInTheDocument();
    expect(screen.getByText(/Взяли лодку/)).toBeInTheDocument();
    await r.user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('switches the language mid-game from the drawer header', async () => {
    const r = renderShell(gameAt('morning'));
    expect(screen.getByRole('button', { name: MORNING.start.ru })).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Бортжурнал' }));
    const dialog = screen.getByRole('dialog', { name: 'Бортжурнал' });
    const langs = within(dialog).getByRole('group', { name: 'Язык' });
    expect(within(langs).getByRole('button', { name: 'RU' })).toHaveAttribute('aria-pressed', 'true');
    await r.user.click(within(langs).getByRole('button', { name: 'EN' }));
    expect(r.session().lang).toBe('en');
    expect(r.session().game!.lang).toBe('en');
    expect(screen.getByRole('dialog', { name: 'Logbook' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: MORNING.start.en })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: MORNING.start.ru })).toBeNull();
  });

  it('labels voice parts of past rolls without today\'s voice level', async () => {
    const base = gameAt('evening');
    const odds = { value: 0.21, parts: [{ source: 'base', delta: 0.25 }, { source: 'voice.caution', delta: -0.04, kind: 'mul' as const, factor: 0.84 }] };
    const game = { ...base, voices: { ...base.voices, caution: 3 }, log: [...base.log, { day: base.day, clockMin: base.clockMin, kind: 'roll' as const, cause: 'roll:sail_break:r', odds, data: { hit: false } }] };
    const r = renderShell(game);
    await r.user.click(screen.getByRole('button', { name: 'Бортжурнал' }));
    const dialog = screen.getByRole('dialog', { name: 'Бортжурнал' });
    const badge = within(dialog).getAllByRole('button', { name: '21%' }).at(-1)!;
    await r.user.click(badge);
    const parts = document.getElementById(badge.getAttribute('aria-controls')!)!;
    expect(within(parts).getByText('Осторожность −16%')).toBeVisible();
    expect(within(dialog).queryByText(/Осторожность 3/)).toBeNull();
  });

  it('is absent in the menu', () => {
    renderShell(null);
    expect(screen.queryByRole('button', { name: 'Бортжурнал' })).toBeNull();
  });
});
