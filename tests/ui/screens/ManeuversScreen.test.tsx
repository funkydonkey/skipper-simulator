import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { forecastSituation, maneuverRisk, type DayPlan, type Maneuver } from '../../../src/engine';
import { ManeuverSketch } from '../../../src/ui/screens/maneuvers/ManeuverSketch';
import { OrderPicker } from '../../../src/ui/screens/maneuvers/OrderPicker';
import { content, gameAt } from '../fixtures';
import { renderShell, renderWithSession } from '../render';

const leg = { routeId: 'r_base_marina_cala_azzurra', mode: 'motor' as const, reefs: 0 as const, genoa: 'full' as const, course: 'direct' as const };
const toBay = { departureHour: 9, legs: [leg], swimStops: 0, shower: 'normal' as const, autopilot: false };

const toNisi: DayPlan = { ...toBay, legs: [{ ...leg, routeId: 'r_cala_azzurra_nisi_quay' }] };
const mooringMed = content.maneuvers.find((x) => x.id === 'mooring_med')!;
const stepText = (m: Maneuver, id: string): string => m.steps.find((s) => s.id === id)!.text.ru;
/** Day 1 of the meltemi week blows W: at Nisi stern-to that is wind on the port side; the quay's marinero is unlikely (30%). */
const nisiGame = () => ({ ...gameAt('planning'), locationId: 'cala_azzurra', clockMin: 8 * 60 });

function startAt(plan: DayPlan) {
  const r = renderShell(nisiGame());
  r.dispatch({ type: 'draft_plan', plan });
  return r;
}

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
      for (const step of m.steps.filter((x) => x.when === undefined)) await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    }
    expect(done).toBeEnabled();
    await r.user.click(done);
    expect(r.currentScreen()).toBe('passage');
    const orders = r.session().game!.log.filter((e) => e.cause.startsWith('order:')).map((e) => e.cause.split(':')[1]);
    expect(orders).toEqual(['ok', 'ok']);
  });

  it('shows the injury risk of each maneuver with a breakdown', async () => {
    const r = startManeuvers();
    const risk = maneuverRisk(r.session().game!, content, 'departure')!;
    const pct = Math.round(risk.value * 100);
    expect(screen.getAllByText(/Если ошибёшься — риск травмы до/).length).toBe(2);
    const badge = screen.getAllByRole('button', { name: `${pct}%` })[0]!;
    await r.user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText(/^база \d+%$/).filter((e) => e.closest('[hidden]') === null)).toHaveLength(1);
  });

  it('a step can be taken back', async () => {
    const r = startManeuvers();
    const step = content.maneuvers.find((x) => x.kind === 'departure')!.steps[0]!;
    await r.user.click(screen.getByRole('button', { name: step.text.ru }));
    await r.user.click(screen.getByRole('button', { name: `Убрать: ${step.text.ru}` }));
    expect(screen.getByRole('button', { name: step.text.ru })).toBeInTheDocument();
  });

  it('goes back to the plan with the drafted legs and settings intact', async () => {
    const r = renderShell({ ...gameAt('planning'), locationId: 'base_marina', clockMin: 8 * 60 });
    r.dispatch({ type: 'draft_plan', plan: { ...toBay, departureHour: 10, swimStops: 1, legs: [{ ...leg, mode: 'sail', reefs: 1 }] } });
    await r.user.click(screen.getByRole('button', { name: 'Назад к плану' }));
    expect(r.currentScreen()).toBe('planning');
    expect(screen.getByText(/Марина Порто-Кало \(база\) → Кала-Адзурра/)).toBeInTheDocument();
    expect(screen.getByLabelText('Под парусом')).toBeChecked();
    expect(screen.getByLabelText('Рифы')).toHaveValue('1');
    expect(screen.getByLabelText('Выход')).toHaveValue('10');
    await r.user.click(screen.getByRole('button', { name: 'К манёврам' }));
    expect(r.session().ui.draftPlan).toMatchObject({ departureHour: 10, swimStops: 1, legs: [{ mode: 'sail', reefs: 1 }] });
  });

  it('offers the last order again', async () => {
    const m = content.maneuvers.find((x) => x.kind === 'departure')!;
    const last = m.steps.map((s) => s.id).reverse();
    const onChange = vi.fn();
    const { user } = renderWithSession(<OrderPicker maneuver={m} pool={m.steps.map((s) => s.id)} order={[]} onChange={onChange} lastOrder={last} />, gameAt('planning'));
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect(onChange).toHaveBeenCalledWith(last);
  });

  it('the forecast shapes the mooring steps: crosswind and no marinero add their steps', () => {
    const r = startAt(toNisi);
    const situation = forecastSituation(r.session().game!, content, toNisi)!;
    expect(situation).toMatchObject({ windSide: 'port', marinero: false, source: 'forecast' });
    const mooring = r.container.querySelector('section[data-kind="mooring"]') as HTMLElement;
    for (const id of ['windward_stern_first', 'pick_lazy_line_boathook']) {
      expect(mooring.querySelector(`button[data-step="${id}"]`), id).not.toBeNull();
    }
    expect(mooring.querySelector('button[data-step="extra_fenders_neighbor"]'), 'not tight: no extra fenders').toBeNull();
  });

  it('shows the forecast situation card with the marinero chance', () => {
    startAt(toNisi);
    expect(screen.getByText('Прогноз — на месте может отличаться')).toBeInTheDocument();
    expect(screen.getByText('маринеро:')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30%' })).toBeInTheDocument();
  });

  it('at Order 3 the hint names the conditional step the situation adds', () => {
    const r = startAt(toNisi);
    expect(r.session().game!.voices.order).toBe(3);
    expect(screen.getByText(`Порядок подсказывает: ${stepText(mooringMed, 'windward_stern_first')}`)).toBeInTheDocument();
  });

  it('no hint below Order 3', () => {
    const r = renderShell({ ...nisiGame(), voices: { ...nisiGame().voices, order: 2 } });
    r.dispatch({ type: 'draft_plan', plan: toNisi });
    expect(screen.queryByText(/Порядок подсказывает/)).toBeNull();
  });

  it('Done waits for every step of the current pool, conditional ones included, and the plan commits', async () => {
    const r = startAt(toNisi);
    const done = screen.getByRole('button', { name: 'Готово' });
    for (const section of r.container.querySelectorAll<HTMLElement>('section[data-kind]')) {
      const m = content.maneuvers.find((x) => x.title.ru === section.querySelector('h2')!.textContent)!;
      for (const s of m.steps.filter((x) => x.when === undefined)) {
        const b = section.querySelector<HTMLButtonElement>(`button[data-step="${s.id}"]`);
        if (b) await r.user.click(b);
      }
    }
    expect(done, 'conditional steps still in the pool').toBeDisabled();
    for (const b of r.container.querySelectorAll<HTMLButtonElement>('ul button[data-step]')) await r.user.click(b);
    expect(done).toBeEnabled();
    await r.user.click(done);
    expect(r.currentScreen()).toBe('passage');
  });

  it('a side-to plan gets the side-to maneuver, its sketch, and an order the engine accepts', async () => {
    const plan: DayPlan = { ...toNisi, berth: 'side_to' };
    const r = startAt(plan);
    const mooring = r.container.querySelector('section[data-kind="mooring"]') as HTMLElement;
    expect(mooring.querySelector('h2')!.textContent).toBe('Швартовка лагом');
    expect(mooring.querySelector('svg[data-sketch="side_to"]')).not.toBeNull();
    expect(mooring.querySelector('button[data-step="bow_spring_first"]')).not.toBeNull();
    for (let b = r.container.querySelector<HTMLButtonElement>('ul button[data-step]'); b; b = r.container.querySelector<HTMLButtonElement>('ul button[data-step]')) {
      await r.user.click(b);
    }
    await r.user.click(screen.getByRole('button', { name: 'Готово' }));
    expect(r.currentScreen()).toBe('passage');
    expect(r.session().game!.log.some((e) => e.cause.startsWith('roll:marinero:nisi_quay') || e.cause.startsWith('marina:'))).toBe(true);
  });

  it('the stern-to sketch stays for a stern-to plan; the ashore sketch draws for anchor_ashore', () => {
    const r = startAt(toNisi);
    expect(r.container.querySelector('section[data-kind="mooring"] svg[data-sketch="stern_to"]')).not.toBeNull();
    r.unmount();
    const ashore = renderWithSession(<ManeuverSketch kind="anchoring" berth="anchor_ashore" />, gameAt('planning'));
    expect(ashore.container.querySelector('svg[data-sketch="anchor_ashore"]')).not.toBeNull();
  });
});

describe('OrderPicker: as last time', () => {
  const pool = ['fenders_ready', 'brief_roles', 'windward_stern_first', 'stern_lines_ashore', 'cleat_stern', 'pick_lazy_line_boathook', 'pick_mooring'];

  function Stateful({ lastOrder, initial = [] }: { lastOrder: string[]; initial?: string[] }) {
    const [order, setOrder] = useState<string[]>(initial);
    return <OrderPicker maneuver={mooringMed} pool={pool} order={order} onChange={setOrder} lastOrder={lastOrder} />;
  }

  it('a last order lacking the new steps fills the overlap in last order and says N of M', async () => {
    const last = ['brief_roles', 'fenders_ready', 'stern_lines_ashore', 'cleat_stern', 'pick_mooring'];
    const { user, container } = renderWithSession(<Stateful lastOrder={last} />, gameAt('planning'));
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect([...container.querySelectorAll('ol button[data-step]')].map((b) => b.getAttribute('data-step'))).toEqual(last);
    expect(screen.getByText('Подставил 5 из 7 шагов — обстановка другая')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Как в прошлый раз' })).toBeNull();
  });

  it('drops last-order steps that are not in today\'s pool', async () => {
    const onChange = vi.fn();
    const { user } = renderWithSession(
      <OrderPicker maneuver={mooringMed} pool={pool} order={[]} onChange={onChange} lastOrder={['extra_fenders_neighbor', 'brief_roles', 'fenders_ready']} />, gameAt('planning'),
    );
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect(onChange).toHaveBeenCalledWith(['brief_roles', 'fenders_ready']);
  });

  it('the same set fills everything without a note', async () => {
    const last = [...pool].reverse();
    const { user } = renderWithSession(<Stateful lastOrder={last} />, gameAt('planning'));
    await user.click(screen.getByRole('button', { name: 'Как в прошлый раз' }));
    expect(screen.queryByText(/Подставил/)).toBeNull();
  });

  it('hidden when nothing overlaps or the order is started', () => {
    const a = renderWithSession(<Stateful lastOrder={['bow_spring_first']} />, gameAt('planning'));
    expect(screen.queryByRole('button', { name: 'Как в прошлый раз' })).toBeNull();
    a.unmount();
    renderWithSession(<Stateful lastOrder={['brief_roles']} initial={['fenders_ready']} />, gameAt('planning'));
    expect(screen.queryByRole('button', { name: 'Как в прошлый раз' })).toBeNull();
  });

  it('English note', async () => {
    const { user } = renderWithSession(<Stateful lastOrder={['brief_roles']} />, { ...gameAt('planning'), lang: 'en' }, 'en');
    await user.click(screen.getByRole('button', { name: 'Same as last time' }));
    expect(screen.getByText('Filled 1 of 7 steps — the situation changed')).toBeInTheDocument();
  });
});
