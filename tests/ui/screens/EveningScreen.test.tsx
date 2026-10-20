import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../../src/engine';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('EveningScreen', () => {
  it('disables the taverna where there is none', () => {
    renderShell({ ...gameAt('evening'), locationId: 'cala_azzurra' });
    expect(screen.getByLabelText(/^\s*Таверна ·/)).toBeDisabled();
    expect(screen.getByText('Таверны здесь нет')).toBeInTheDocument();
  });

  it('disables the taverna after closing time', () => {
    renderShell({ ...gameAt('evening'), locationId: 'base_marina', clockMin: 23 * 60 + 30 });
    expect(screen.getByLabelText(/^\s*Таверна ·/)).toBeDisabled();
    expect(screen.getByText(/Таверна уже закрыта/)).toBeInTheDocument();
  });

  it('ends the day and opens the next morning', async () => {
    const r = renderShell(gameAt('evening'));
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.currentScreen()).toBe('morning');
    expect(r.session().game!.day).toBe(2);
  });

  const xpEntry = (game: GameState, cause: string, xp: number) => ({ day: game.day, clockMin: 600, kind: 'info' as const, cause, data: { xp } });

  it('hides the growth block when nothing was learned', () => {
    renderShell({ ...gameAt('evening'), log: [] });
    expect(screen.queryByText('Чему научил день')).not.toBeInTheDocument();
  });

  it('shows today\'s xp by voice and previews the level-up', () => {
    const base = gameAt('evening');
    const game: GameState = {
      ...base,
      voices: { ...base.voices, mechanic: 1 },
      voiceXp: { ...base.voiceXp, mechanic: 10 },
      log: [xpEntry(base, 'xp:mechanic:order:wrong:anchoring:x', 3), { ...xpEntry(base, 'xp:order:order:ok:anchoring', 1), day: base.day + 5 }],
    };
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    renderShell(game);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
    expect(screen.getByText('Чему научил день')).toBeInTheDocument();
    expect(screen.getByText(/\+3 Механик/)).toBeInTheDocument();
    expect(screen.queryByText(/\+1 Порядок/)).not.toBeInTheDocument();
    expect(screen.getByText('⬆ Механик 1 → 2')).toBeInTheDocument();
  });
});
