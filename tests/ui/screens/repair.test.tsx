import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { previewPlan, type GameState } from '../../../src/engine';
import { PreviewPanel } from '../../../src/ui/screens/planning/PreviewPanel';
import { content, gameAt } from '../fixtures';
import { renderShell, renderWithSession } from '../render';

/** Evening at anchor in a bay, with the given systems broken and the given money. */
function eveningAtAnchor(broken: string[], moneyEur = 500): GameState {
  const base = gameAt('evening');
  const systems = Object.fromEntries(Object.entries(base.systems).map(([id, s]) => [id, broken.includes(id) ? { ...s, broken: true } : s]));
  return {
    ...base, systems, locationId: 'cala_azzurra', resources: { ...base.resources, moneyEur },
    dayFacts: base.dayFacts && { ...base.dayFacts, mooring: 'anchor' },
  };
}

describe('RepairBlock', () => {
  it('is hidden when nothing is broken', () => {
    renderShell(eveningAtAnchor([]));
    expect(screen.queryByRole('region', { name: 'Ремонт' })).not.toBeInTheDocument();
  });

  it('offers a self repair with its odds and a marina-only service at anchor', () => {
    renderShell(eveningAtAnchor(['engine_cooling']));
    const block = screen.getByRole('region', { name: 'Ремонт' });
    const self = within(block).getByRole('button', { name: /Починить самим/ });
    expect(self).toBeEnabled();
    expect(within(block).getByText('40 €')).toBeInTheDocument();
    expect(within(block).getByText(/^\d+%$/)).toBeInTheDocument();
    expect(within(block).getByRole('button', { name: /Сервис в марине/ })).toBeDisabled();
    expect(within(block).getByText('только в марине')).toBeInTheDocument();
  });

  it('shows "no money" when the repair costs more than the purse', () => {
    renderShell(eveningAtAnchor(['engine_cooling'], 10));
    const block = screen.getByRole('region', { name: 'Ремонт' });
    expect(within(block).getByRole('button', { name: /Починить самим/ })).toBeDisabled();
    expect(within(block).getByText('нет денег')).toBeInTheDocument();
  });

  it('speaks English', () => {
    renderShell({ ...eveningAtAnchor(['engine_cooling']), lang: 'en' }, { lang: 'en' });
    const block = screen.getByRole('region', { name: 'Repairs' });
    expect(within(block).getByText('marina only')).toBeInTheDocument();
  });

  it('repairs on click: the system is no longer broken and the attempt is logged', async () => {
    const r = renderShell(eveningAtAnchor(['gas']));
    await r.user.click(screen.getByRole('button', { name: /Починить самим/ }));
    const game = r.session().game!;
    expect(game.log.some((e) => e.cause.startsWith('repair:gas:self:'))).toBe(true);
    expect(r.session().error).toBeNull();
  });
});

describe('Evening with broken systems and little money', () => {
  it('disables cooking with a reason when the gas system is broken', () => {
    renderShell(eveningAtAnchor(['gas']));
    expect(screen.getByLabelText('Готовим на борту')).toBeDisabled();
    expect(screen.getByText(/Газ сломан/)).toBeInTheDocument();
  });

  it('keeps cooking when only an unrelated system is broken', () => {
    renderShell(eveningAtAnchor(['heads']));
    expect(screen.getByLabelText('Готовим на борту')).toBeEnabled();
  });

  it('disables the taverna with "no money" when the bill is out of reach', () => {
    renderShell({ ...eveningAtAnchor([], 10), locationId: 'base_marina' });
    expect(screen.getByLabelText(/^\s*Таверна ·/)).toBeDisabled();
    expect(screen.getByText('нет денег')).toBeInTheDocument();
  });

  it('shows the systems panel', () => {
    renderShell(eveningAtAnchor(['engine_cooling']));
    expect(screen.getByRole('list', { name: 'Системы лодки' })).toBeInTheDocument();
  });
});

describe('Planning preview', () => {
  it('marks a marina destination "no money" when the berth is unaffordable', () => {
    const game = gameAt('planning');
    const preview = { ...previewPlan(game, content, { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false }), marinaAffordable: false };
    renderWithSession(<PreviewPanel preview={preview} />, game);
    expect(screen.getByText(/нет денег/)).toBeInTheDocument();
  });
});
