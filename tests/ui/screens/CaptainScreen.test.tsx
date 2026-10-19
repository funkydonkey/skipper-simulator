import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TRAINABLE_VOICES } from '../../../src/engine';
import { VOICE_NAMES } from '../../../src/ui/i18n/glossary';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const raise = (voice: (typeof TRAINABLE_VOICES)[number]) => screen.getByRole('button', { name: `Прибавить: ${VOICE_NAMES[voice].ru}` });

describe('CaptainScreen', () => {
  it('distributes 12 points and moves on to the boats', async () => {
    const r = renderShell(gameAt('captain'));
    const next = screen.getByRole('button', { name: 'Дальше' });
    expect(next).toBeDisabled();
    for (const v of TRAINABLE_VOICES) {
      await r.user.click(raise(v));
      await r.user.click(raise(v));
    }
    expect(screen.getByText(/Осталось очков: 0/)).toBeInTheDocument();
    expect(next).toBeEnabled();
    await r.user.click(next);
    expect(r.currentScreen()).toBe('boat');
    expect(r.session().game?.voices.sea_sense).toBe(2);
  });

  it('caps a voice at the max level and never goes below zero', async () => {
    const r = renderShell(gameAt('captain'));
    for (let i = 0; i < 5; i++) await r.user.click(raise('mechanic'));
    expect(raise('mechanic')).toBeDisabled();
    expect(screen.getByRole('button', { name: `Убавить: ${VOICE_NAMES.order.ru}` })).toBeDisabled();
    expect(screen.getByText(/Осталось очков: 8/)).toBeInTheDocument();
  });

  it('shows the fixed voices', () => {
    renderShell(gameAt('captain'));
    expect(screen.getByText('Гордость')).toBeInTheDocument();
    expect(screen.getAllByText('не прокачивается')).toHaveLength(2);
  });

  it('shows an icon next to every voice', () => {
    const { container } = renderShell(gameAt('captain'));
    expect(container.querySelectorAll('li svg').length).toBeGreaterThanOrEqual(8);
  });
});
