import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildDebrief } from '../../../src/engine';
import { memoryStorage, readSave, writeSave } from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('DebriefScreen', () => {
  it('shows the five scales and every debrief link', () => {
    const game = gameAt('debrief');
    renderShell(game);
    for (const name of ['Безопасность', 'Экипаж', 'Лодка', 'Расписание', 'Бюджет']) expect(screen.getByRole('heading', { name })).toBeInTheDocument();
    const d = buildDebrief(game, content);
    for (const l of d.links) expect(screen.getByText(l.text.ru)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/Оценка:/)).toHaveLength(5);
    expect(screen.getByText(/^Потрачено \d+ € из \d+ €$/)).toBeInTheDocument();
  });

  it('clears the save slot and replays the same week', async () => {
    const storage = memoryStorage();
    writeSave(storage, gameAt('morning'), new Date());
    const game = gameAt('debrief', 99);
    const r = renderShell(game, { storage });
    expect(readSave(storage, content).kind).toBe('none');
    await r.user.click(screen.getByRole('button', { name: 'Сыграть ту же неделю' }));
    expect(r.currentScreen()).toBe('captain');
    expect(r.session().game!.seed).toBe(99);
  });

  it('goes back to the menu', async () => {
    const r = renderShell(gameAt('debrief'));
    await r.user.click(screen.getByRole('button', { name: 'В меню' }));
    expect(r.currentScreen()).toBe('menu');
  });
});
