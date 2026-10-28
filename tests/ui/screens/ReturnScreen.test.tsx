import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('ReturnScreen', () => {
  it('reports whether the boat came back on time and hands it over', async () => {
    const game = gameAt('return');
    const r = renderShell(game);
    expect(screen.getByText(game.returnedOnTime ? /Вернулись на базу в \d\d:\d\d/ : /Опоздали/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Сдать лодку' }));
    expect(r.currentScreen()).toBe('debrief');
  });

  it('shows a late return and its fee', () => {
    renderShell({ ...gameAt('return'), returnedOnTime: false, damages: [] });
    expect(screen.getByText(/Опоздали.*400 €/)).toBeInTheDocument();
    expect(screen.queryByText('Базовый менеджер доволен.')).toBeNull();
  });

  it('shows the real arrival time and the deposit the base keeps', () => {
    const game = gameAt('return');
    const ok = { ...game, returnedOnTime: true, damages: [], log: [...game.log.filter((e) => !e.cause.startsWith('return:')), { day: 6, clockMin: 12 * 60 + 58, kind: 'info' as const, cause: 'return:on_time', data: { arrivalHour: 12.97 } }] };
    const r = renderShell(ok);
    expect(screen.getByText(/Вернулись на базу в 12:58/)).toBeInTheDocument();
    expect(screen.getByText('Базовый менеджер доволен.')).toBeInTheDocument();
    r.unmount();
    renderShell({ ...ok, damages: ['hull_scratch'] });
    expect(screen.getByText(/удержал из депозита \d+ €/)).toBeInTheDocument();
    expect(screen.queryByText('Базовый менеджер доволен.')).toBeNull();
  });
});
