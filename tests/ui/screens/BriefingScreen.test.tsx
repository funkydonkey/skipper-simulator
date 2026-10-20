import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

const topic = (id: string) => screen.getByRole('button', { name: new RegExp(content.briefing.find((t) => t.id === id)!.title.ru) });
const line = (id: string) => screen.getByRole('button', { name: new RegExp(content.dialogues.find((d) => d.id === id)!.said.ru) });

describe('BriefingScreen', () => {
  it('shows what check-in found and never the hidden defects', () => {
    const game = gameAt('briefing');
    renderShell(game);
    const found = game.log.filter((e) => e.cause.startsWith('checkin:found:')).map((e) => e.cause.split(':')[2]);
    const hidden = game.log.filter((e) => e.cause.startsWith('defect:hidden:')).map((e) => e.cause.split(':')[2]);
    const defects = content.boats.flatMap((b) => b.defectPool);
    for (const id of found) expect(screen.getByText(new RegExp(defects.find((d) => d.id === id)!.description.ru))).toBeInTheDocument();
    for (const id of hidden) expect(screen.queryByText(new RegExp(defects.find((d) => d.id === id)!.description.ru))).toBeNull();
  });

  it('needs exactly four topics and starts the week', async () => {
    const r = renderShell(gameAt('briefing'));
    const start = screen.getByRole('button', { name: 'Начать неделю' });
    for (const id of ['captain_only', 'cleats', 'loaded_lines']) await r.user.click(topic(id));
    expect(start).toBeDisabled();
    await r.user.click(topic('toilet'));
    expect(start).toBeEnabled();
    expect(topic('sails')).toBeDisabled();
    await r.user.click(start);
    expect(r.currentScreen()).toBe('morning');
    expect(r.session().game!.flags['briefing.captain_only']).toBe(true);
  });

  it('shows what the crew heard and limits first lines to two', async () => {
    const r = renderShell(gameAt('briefing'));
    await r.user.click(line('early_try'));
    expect(screen.getByText(/Экипаж услышал: «Выходим в 8»/)).toBeInTheDocument();
    await r.user.click(line('ten_bonus'));
    expect(line('decide_morning')).toBeDisabled();
  });
});
