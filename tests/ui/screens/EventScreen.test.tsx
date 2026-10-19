import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { content, gameAt, withEvent } from '../fixtures';
import { renderShell } from '../render';

const checkEvent = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => o.check && !o.requires))!;
const plainEvent = content.events.find((e) => e.id !== checkEvent.id && e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
const esc = (s: string) => new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

describe('EventScreen', () => {
  it('shows the scene, the text and each option, with check odds', () => {
    renderShell(withEvent(gameAt('evening'), checkEvent.id));
    expect(document.querySelector(`[data-scene="${checkEvent.scene}"]`)).not.toBeNull();
    expect(screen.getByText(checkEvent.text.ru.split(/(?<=[.!?…])\s/)[0]!.trim(), { exact: false })).toBeInTheDocument();
    for (const o of checkEvent.options) expect(screen.getByRole('button', { name: esc(o.text.ru) })).toBeInTheDocument();
    expect(screen.getAllByText(/\d+%/).length).toBeGreaterThan(0);
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
