import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { expert } from '../../src/sim/strategies';
import { loadBundledContent } from '../../src/ui/content';
import { readSave } from '../../src/ui/session/save';
import { content, gameAt } from './fixtures';
import { renderShell } from './render';

describe('Shell', () => {
  it('bundled content passes validation', () => {
    expect(loadBundledContent().errors).toEqual([]);
  });

  it('shows the menu without a game and the phase screen with one', () => {
    expect(renderShell(null).currentScreen()).toBe('menu');
  });

  it.each([
    ['captain', 'captain'], ['boat_select', 'boat'], ['checkin', 'checkin'], ['briefing', 'briefing'],
    ['morning', 'morning'], ['planning', 'planning'], ['return', 'return'], ['debrief', 'debrief'],
  ] as const)('phase %s renders screen %s', (phase, expected) => {
    expect(renderShell(gameAt(phase)).currentScreen()).toBe(expected);
  });

  it('autosaves when a morning starts, not before', () => {
    const r = renderShell(gameAt('briefing'));
    expect(readSave(r.storage, content).kind).toBe('none');
    r.dispatch({ type: 'briefing', topicIds: expert.briefingTopics, dialogueIds: [] });
    expect(r.currentScreen()).toBe('morning');
    const saved = readSave(r.storage, content);
    expect(saved.kind === 'ok' && saved.game.day).toBe(1);
  });

  it('sets <html lang> from the session language', () => {
    renderShell(null, { lang: 'en' });
    expect(document.documentElement.lang).toBe('en');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('tints the whole app by the game clock', () => {
    const { container } = renderShell({ ...gameAt('evening'), clockMin: 22 * 60 });
    expect(container.querySelector('.app')?.getAttribute('data-daytime')).toBe('night');
  });
});
