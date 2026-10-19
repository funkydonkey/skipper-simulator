import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
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

  it('is absent in the menu', () => {
    renderShell(null);
    expect(screen.queryByRole('button', { name: 'Бортжурнал' })).toBeNull();
  });
});
