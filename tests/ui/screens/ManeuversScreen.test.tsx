import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OrderPicker } from '../../../src/ui/screens/maneuvers/OrderPicker';
import { content, gameAt } from '../fixtures';
import { renderShell, renderWithSession } from '../render';

const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
const toBay = { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal' as const, autopilot: false };

function startManeuvers() {
  const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
  r.dispatch({ type: 'draft_plan', plan: toBay });
  return r;
}

describe('ManeuversScreen', () => {
  it('orders every maneuver correctly and sets sail', async () => {
    const r = startManeuvers();
    expect(r.currentScreen()).toBe('maneuvers');
    const done = screen.getByRole('button', { name: 'Готово' });
    expect(done).toBeDisabled();
    for (const kind of ['departure', 'anchoring'] as const) {
      const m = content.maneuvers.find((x) => x.kind === kind)!;
      for (const step of m.steps) await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    }
    expect(done).toBeEnabled();
    await r.user.click(done);
    expect(r.currentScreen()).toBe('passage');
    const orders = r.session().game!.log.filter((e) => e.cause.startsWith('order:')).map((e) => e.cause.split(':')[1]);
    expect(orders).toEqual(['ok', 'ok']);
  });

  it('a step can be taken back', async () => {
    const r = startManeuvers();
    const step = content.maneuvers.find((x) => x.kind === 'departure')!.steps[0]!;
    await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    await r.user.click(screen.getByRole('button', { name: `Убрать: ${step.text.ru}` }));
    expect(screen.getByRole('button', { name: step.text.ru })).toBeInTheDocument();
  });

  it('goes back to the plan', async () => {
    const r = startManeuvers();
    await r.user.click(screen.getByRole('button', { name: 'Назад к плану' }));
    expect(r.currentScreen()).toBe('planning');
  });

  it('offers the last order again', async () => {
    const m = content.maneuvers.find((x) => x.kind === 'departure')!;
    const last = m.steps.map((s) => s.id).reverse();
    const onChange = vi.fn();
    const { user } = renderWithSession(<OrderPicker maneuver={m} pool={m.steps.map((s) => s.id)} order={[]} onChange={onChange} lastOrder={last} />, gameAt('planning'));
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect(onChange).toHaveBeenCalledWith(last);
  });
});
