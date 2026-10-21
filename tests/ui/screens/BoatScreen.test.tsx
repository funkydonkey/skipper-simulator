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
    // once as a shiny feature, once in the systems profile
    expect(within(aurora).getAllByText('Подруливающее устройство')).toHaveLength(2);
    expect(within(aurora).getByText(/Стартовый и сервисный — один банк/)).toBeInTheDocument();
  });

  it('shows the weakness line and marks worn systems', () => {
    const { container } = renderShell(gameAt('boat_select'));
    const aurora = container.querySelector('[data-boat="aurora_45"]') as HTMLElement;
    expect(within(aurora).getByText(/Один общий аккумулятор/)).toBeInTheDocument();
    const meltemi = container.querySelector('[data-boat="meltemi_40"]') as HTMLElement;
    expect(within(meltemi).getByText(/Паруса и такелаж изношены/)).toBeInTheDocument();
    const rig = content.systems.find((s) => s.id === 'rig')!.name.ru;
    const row = within(meltemi).getAllByRole('listitem').find((li) => li.textContent?.includes(rig) && li.closest('[aria-label]'))!;
    expect(row).toHaveTextContent('изношено');
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
