import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('MorningScreen', () => {
  it('shows open expectations as the crew heard them', () => {
    const game = gameAt('morning');
    renderShell(game);
    const open = game.expectations.filter((e) => e.status === 'open');
    expect(open.length).toBeGreaterThan(0);
    for (const e of open) {
      expect(screen.getByText(new RegExp(content.dialogues.find((d) => d.id === e.dialogueId)!.heard.ru))).toBeInTheDocument();
    }
  });

  it('starts the day with the barometer and a promise', async () => {
    const r = renderShell(gameAt('morning'));
    await r.user.click(screen.getByLabelText('Посмотреть на барометр и небо'));
    await r.user.click(screen.getByLabelText(/Постараемся выйти пораньше/));
    expect(screen.getByText(/услышал: «Выходим в 8»/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Начать день' }));
    expect(['planning', 'event']).toContain(r.currentScreen());
    const today = r.session().game!.log.filter((e) => e.day === 1).map((e) => e.cause);
    expect(today).toContain('barometer:open');
    expect(today).toContain('dialogue:early_try');
  });
});
