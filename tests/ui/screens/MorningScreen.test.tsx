import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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

  it('a keen sea sense reads the weather anyway: the barometer box is ticked, locked and logged as read', async () => {
    const game = gameAt('morning');
    const r = renderShell({ ...game, voices: { ...game.voices, sea_sense: content.balance.voices.seaSenseSignalLevel } });
    const box = screen.getByLabelText('Посмотреть на барометр и небо');
    expect(box).toBeChecked();
    expect(box).toHaveAttribute('aria-readonly', 'true');
    expect(box).toBeEnabled();
    await r.user.click(box);
    expect(box).toBeChecked();
    await r.user.click(screen.getByRole('button', { name: 'Начать день' }));
    const today = r.session().game!.log.filter((e) => e.day === game.day).map((e) => e.cause);
    expect(today).toContain('barometer:open');
    expect(today).not.toContain('barometer:ignored');
  });

  it('starts the day with the barometer and a promise', async () => {
    const game = gameAt('morning');
    const r = renderShell({ ...game, voices: { ...game.voices, sea_sense: 0 } });
    await r.user.click(screen.getByLabelText('Посмотреть на барометр и небо'));
    await r.user.click(screen.getByLabelText(/Постараемся выйти пораньше/));
    expect(screen.getByText(/услышал: «Выходим в 8»/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Начать день' }));
    expect(['planning', 'event']).toContain(r.currentScreen());
    const today = r.session().game!.log.filter((e) => e.day === 1).map((e) => e.cause);
    expect(today).toContain('barometer:open');
    expect(today).toContain('dialogue:early_try');
  });

  it('expectations with the same dialogue and creation day but different due days get unique React keys', () => {
    const game = gameAt('morning');
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const base = { dialogueId: content.dialogues[0]!.id, spec: game.expectations[0]?.spec ?? ({} as never), strength: 1, createdDay: game.day, status: 'open' as const };
    const two = [{ ...base, id: `${base.dialogueId}@${game.day}`, dueDay: game.day }, { ...base, id: `${base.dialogueId}@${game.day}`, dueDay: game.day + 1 }];
    renderShell({ ...game, expectations: two });
    expect(spy.mock.calls.flat().join(' ')).not.toMatch(/same key/);
    spy.mockRestore();
  });
});
