import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildConditionContext, eventTexts, presentEvent } from '../../../src/engine';
import { content, gameAt, withEvent } from '../fixtures';
import { renderShell } from '../render';

const checkEvent = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => o.check && !o.requires))!;
const plainEvent = content.events.find((e) => e.id !== checkEvent.id && e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
const esc = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

describe('EventScreen', () => {
  it('shows the scene, the text and each option, with check odds', () => {
    renderShell(withEvent(gameAt('evening'), checkEvent.id));
    expect(document.querySelector(`[data-scene="${checkEvent.scene}"]`)).not.toBeNull();
    expect(screen.getByText(eventTexts(checkEvent)[0]!.ru.split(/(?<=[.!?…])\s/)[0]!.trim(), { exact: false })).toBeInTheDocument();
    for (const o of checkEvent.options) expect(screen.getByRole('button', { name: esc(o.text.ru) })).toBeInTheDocument();
    expect(screen.getAllByText(/\d+%/).length).toBeGreaterThan(0);
  });

  it('shows each check as a badge with the engine odds and a breakdown on tap', async () => {
    const game = withEvent(gameAt('evening'), checkEvent.id);
    const view = presentEvent(checkEvent, game, buildConditionContext(game, content), content.balance);
    const idx = view.options.findIndex((o) => o.chance !== null);
    const pct = Math.round(view.options[idx]!.chance!.value * 100);
    const r = renderShell(game);
    const badge = screen.getAllByRole('button', { expanded: false }).find((b) => b.textContent?.endsWith(`· ${pct}%`))!;
    expect(badge).toBeDefined();
    await r.user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/^база \d+%$/)).toBeVisible();
    expect(r.currentScreen()).toBe('event');
  });

  it('describes each check option with its odds badge', () => {
    const game = withEvent(gameAt('evening'), checkEvent.id);
    const view = presentEvent(checkEvent, game, buildConditionContext(game, content), content.balance);
    renderShell(game);
    for (const [i, o] of checkEvent.options.entries()) {
      const option = screen.getByRole('button', { name: esc(o.text.ru) });
      const chance = view.options[i]!.chance;
      if (o.check && chance !== null) expect(option).toHaveAccessibleDescription(new RegExp(`· ${Math.round(chance.value * 100)}%$`));
      else expect(option).not.toHaveAttribute('aria-describedby');
    }
  });

  it('resolves a choice, shows its outcome, then returns to the evening', async () => {
    const option = plainEvent.options.find((o) => !o.requires)!;
    const r = renderShell(withEvent(gameAt('evening'), plainEvent.id));
    await r.user.click(screen.getByRole('button', { name: esc(option.text.ru) }));
    expect(r.currentScreen()).toBe('outcome');
    expect(screen.getAllByText(esc(option.text.ru)).length).toBeGreaterThan(0);
    await r.user.click(screen.getByRole('button', { name: 'Дальше' }));
    expect(r.currentScreen()).toBe('evening');
  });

  it('a double click resolves only the first of two queued events', async () => {
    const option = plainEvent.options.find((o) => !o.requires)!;
    const game = withEvent(withEvent(gameAt('evening'), checkEvent.id), plainEvent.id);
    const r = renderShell(game);
    await r.user.dblClick(screen.getByRole('button', { name: esc(option.text.ru) }));
    expect(r.session().game!.eventQueue).toEqual([checkEvent.id]);
    expect(r.currentScreen()).toBe('outcome');
  });
});
