import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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
});
