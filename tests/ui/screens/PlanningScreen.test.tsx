import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const atBase = () => ({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });

describe('PlanningScreen', () => {
  it('shows the forecast and lets you add and remove a leg on the chart', async () => {
    const r = renderShell(atBase());
    expect(screen.getAllByRole('img', { name: /уз/ }).length).toBeGreaterThan(0);
    await r.user.click(screen.getByRole('button', { name: 'Кала-Адзурра' }));
    expect(screen.getByText(/Марина Порто-Кало \(база\) → Кала-Адзурра/)).toBeInTheDocument();
    expect(screen.getByText(/Приход около/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Убрать последний переход' }));
    expect(screen.queryByText(/Приход около/)).toBeNull();
  });

  it('a stay day goes straight to the evening', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: 'Провести день здесь' }));
    expect(['evening', 'event']).toContain(r.currentScreen());
  });

  it('a sailing day goes to the maneuvers with the plan as drafted', async () => {
    const r = renderShell(atBase());
    await r.user.click(screen.getByRole('button', { name: 'Кала-Адзурра' }));
    await r.user.click(screen.getByLabelText('Под парусом'));
    await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
    expect(r.currentScreen()).toBe('maneuvers');
    expect(r.session().ui.draftPlan?.legs[0]).toMatchObject({ routeId: 'r_base_marina_cala_azzurra', mode: 'sail' });
  });

  it('after sunset only offers to stay', () => {
    renderShell({ ...atBase(), clockMin: 20 * 60 + 30 });
    expect(screen.getByText('Сегодня уже поздно выходить')).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: 'Кала-Адзурра' })).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Провести день здесь' })).toBeEnabled();
  });

  it('an engine rejection shows a localized banner and keeps the screen', () => {
    const r = renderShell(atBase());
    r.dispatch({ type: 'draft_plan', plan: { departureHour: 3, legs: [], swimStops: 0, shower: 'normal', autopilot: false } });
    expect(screen.getByRole('alert')).toHaveTextContent(/^Не получилось:/);
    expect(r.currentScreen()).toBe('planning');
  });
});
