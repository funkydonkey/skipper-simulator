import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { previewPlan, tavernaBill, type GameState } from '../../../src/engine';
import { PreviewPanel } from '../../../src/ui/screens/planning/PreviewPanel';
import { content, gameAt } from '../fixtures';
import { EveningScreen } from '../../../src/ui/screens/evening/EveningScreen';
import { useSession } from '../../../src/ui/session/SessionContext';
import type { Session } from '../../../src/ui/session/types';
import { renderShell, renderWithSession } from '../render';

/** Evening at anchor in a bay, with the given systems broken and the given money. */
function eveningAtAnchor(broken: string[], moneyEur = 500): GameState {
  const base = gameAt('evening');
  const systems = Object.fromEntries(Object.entries(base.systems).map(([id, s]) => [id, { ...s, broken: broken.includes(id) }]));
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
    renderWithSession(<PreviewPanel preview={preview} onBerth={() => {}} />, game);
    expect(screen.getByText(/нет денег/)).toBeInTheDocument();
  });
});

describe('the dinner choice is never stale', () => {
  const radio = (name: RegExp | string) => screen.getByLabelText(name) as HTMLInputElement;
  const TAVERNA = /^\s*Таверна ·/;
  const COOK = 'Готовим на борту';
  /** Evening alongside at the base marina (taverna open until 23:00). */
  function atBase(broken: string[], moneyEur: number, clockMin = 19 * 60): GameState {
    const g = eveningAtAnchor(broken, moneyEur);
    return { ...g, locationId: 'base_marina', clockMin, dayFacts: g.dayFacts && { ...g.dayFacts, mooring: 'berth' } };
  }

  it('with the gas broken, the taverna is chosen by default and lights out eats there', async () => {
    const r = renderShell(atBase(['gas'], 1000));
    expect(radio(COOK).checked).toBe(false);
    expect(radio(TAVERNA).checked).toBe(true);
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.session().error).toBeNull();
    expect(r.session().game!.log.some((e) => e.cause === 'activity:taverna')).toBe(true);
  });

  it('with the gas broken and no taverna, dinner is cold, with the warning, and lights out works', async () => {
    const r = renderShell(eveningAtAnchor(['gas']));
    expect(radio(COOK).checked).toBe(true);
    expect(radio(TAVERNA).checked).toBe(false);
    expect(screen.getByText(/Газ сломан/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.session().error).toBeNull();
    expect(r.session().game!.day).toBe(2);
  });

  it('falls back to cooking when a repair spends the money for the taverna', async () => {
    const start = atBase(['engine_cooling'], 0);
    const bill = tavernaBill(start, content.balance).eur;
    const r = renderShell({ ...start, resources: { ...start.resources, moneyEur: bill + 10 } });
    await r.user.click(radio(TAVERNA));
    expect(radio(TAVERNA).checked).toBe(true);
    await r.user.click(screen.getByRole('button', { name: /Починить самим/ }));
    expect(radio(TAVERNA)).toBeDisabled();
    expect(radio(TAVERNA).checked).toBe(false);
    expect(radio(COOK).checked).toBe(true);
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.session().error).toBeNull();
    expect(r.session().game!.day).toBe(2);
  });

  it('falls back to cooking even when the screen is not remounted after the repair', async () => {
    const seen: { session: Session | null } = { session: null };
    function Probe() {
      seen.session = useSession().session;
      return null;
    }
    const start = atBase(['engine_cooling'], 0);
    const game = { ...start, resources: { ...start.resources, moneyEur: tavernaBill(start, content.balance).eur + 10 } };
    const { user } = renderWithSession(<><EveningScreen /><Probe /></>, game);
    await user.click(radio(TAVERNA));
    await user.click(screen.getByRole('button', { name: /Починить самим/ }));
    expect(radio(TAVERNA).checked).toBe(false);
    expect(radio(COOK).checked).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(seen.session!.error).toBeNull();
    expect(seen.session!.game!.day).toBe(2);
  });

  it('falls back to cooking when a repair runs past the taverna closing time', async () => {
    const r = renderShell(atBase(['engine_cooling'], 2000, 22 * 60));
    await r.user.click(radio(TAVERNA));
    await r.user.click(screen.getByRole('button', { name: /Сервис в марине/ }));
    expect(screen.getByText(/Таверна уже закрыта/)).toBeInTheDocument();
    expect(radio(COOK).checked).toBe(true);
    await r.user.click(screen.getByRole('button', { name: 'Отбой' }));
    expect(r.session().error).toBeNull();
    expect(r.session().game!.log.some((e) => e.cause === 'activity:taverna')).toBe(false);
  });
});
