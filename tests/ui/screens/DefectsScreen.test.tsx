import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { performCheckin } from '../../../src/engine';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

function atDefects() {
  const base = gameAt('checkin');
  const boat = content.boats.find((b) => b.id === base.boatId)!;
  const defect = boat.defectPool.find((d) => d.system)!;
  const game = performCheckin({ ...base, defects: [defect.id] }, content, [defect.checkpoint]);
  return { game, defect };
}

describe('DefectsScreen', () => {
  it('lists the found defects and sails on without fixing', async () => {
    const { game, defect } = atDefects();
    expect(game.phase).toBe('defects');
    const r = renderShell(game);
    expect(r.currentScreen()).toBe('defects');
    expect(screen.getByText(defect.description.ru)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(content.systems.find((s) => s.id === defect.system)!.name.ru))).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Плыть так' }));
    expect(r.currentScreen()).toBe('briefing');
    expect(r.session().game!.defects).toEqual([defect.id]);
    expect(r.session().game!.log.map((e) => e.cause)).toContain(`checkin:sail_on:${defect.id}`);
  });

  it('disables a fix that does not fit the remaining time and sends the chosen fixes', async () => {
    const { game: base } = atDefects();
    const game = {
      ...base,
      boatId: 'meltemi_40',
      defects: ['torn_genoa_seam', 'worn_furler'],
      checkin: { found: ['torn_genoa_seam', 'worn_furler'], fixed: [], minutesLeft: 25 },
    };
    const r = renderShell(game);
    expect(screen.getByText('Осталось времени: 25 мин')).toBeInTheDocument();
    const big = screen.getByRole('button', { name: 'Чинить на базе — 150 €, 30 мин' });
    expect(big).toBeDisabled();
    expect(screen.getByText('не хватает времени')).toBeInTheDocument();
    const small = screen.getByRole('button', { name: 'Чинить на базе — 90 €, 20 мин' });
    await r.user.click(small);
    expect(small).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Осталось времени: 5 мин')).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Подтвердить' }));
    expect(r.currentScreen()).toBe('briefing');
    expect(r.session().game!.checkin?.fixed).toEqual(['worn_furler']);
    expect(r.session().game!.defects).toEqual(['torn_genoa_seam']);
  });
});
