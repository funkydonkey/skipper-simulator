import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('ReturnScreen', () => {
  it('reports whether the boat came back on time and hands it over', async () => {
    const game = gameAt('return');
    const r = renderShell(game);
    expect(screen.getByText(game.returnedOnTime ? /Вернулись на базу к 17:00/ : /Опоздали/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Сдать лодку' }));
    expect(r.currentScreen()).toBe('debrief');
  });

  it('shows a late return and its fee', () => {
    renderShell({ ...gameAt('return'), returnedOnTime: false });
    expect(screen.getByText(/Опоздали.*400 €/)).toBeInTheDocument();
  });
});
