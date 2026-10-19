import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('BoatScreen', () => {
  it('shows every boat with shiny features and the small print', () => {
    const { container } = renderShell(gameAt('boat_select'));
    const cards = container.querySelectorAll('[data-boat]');
    expect(cards).toHaveLength(content.boats.length);
    const aurora = container.querySelector('[data-boat="aurora_45"]') as HTMLElement;
    expect(within(aurora).getByText('Подруливающее устройство')).toBeInTheDocument();
    expect(within(aurora).getByText(/Стартовый и сервисный — один банк/)).toBeInTheDocument();
  });

  it('takes an affordable boat and goes to check-in', async () => {
    const r = renderShell(gameAt('boat_select'));
    const money = r.session().game!.resources.moneyEur;
    await r.user.click(screen.getByRole('button', { name: 'Взять «Мельтеми 40»' }));
    expect(r.currentScreen()).toBe('checkin');
    expect(r.session().game!.resources.moneyEur).toBe(money - 4300);
  });

  it('disables boats over budget', () => {
    const poor = gameAt('boat_select');
    renderShell({ ...poor, resources: { ...poor.resources, moneyEur: 4000 } });
    expect(screen.getByRole('button', { name: 'Взять «Аврора 45»' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Взять «Калипсо 38»' })).toBeEnabled();
    expect(screen.getAllByText('Не по бюджету').length).toBe(2);
  });
});
