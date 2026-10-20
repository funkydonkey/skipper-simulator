import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChanceValue } from '../../../src/engine';
import { ChanceBadge } from '../../../src/ui/components/ChanceBadge';
import { formatPart, partLabel } from '../../../src/ui/view/chance';
import { gameAt } from '../fixtures';
import { renderWithSession } from '../render';

const odds: ChanceValue = {
  value: 0.65,
  parts: [
    { source: 'base', delta: 0.5 },
    { source: 'voice.mechanic', delta: 0.15 },
    { source: 'fatigue', delta: -0.05 },
    { source: 'wind', delta: 0.001 },
  ],
};
const game = () => ({ ...gameAt('planning'), voices: { ...gameAt('planning').voices, mechanic: 3 } });

describe('ChanceBadge', () => {
  it('shows the percentage and toggles the breakdown on click', async () => {
    const r = renderWithSession(<ChanceBadge odds={odds} />, game());
    const badge = screen.getByRole('button', { name: '65%' });
    expect(badge).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/база/)).not.toBeVisible();
    await r.user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'true');
    expect(badge).toHaveAttribute('aria-controls', screen.getByRole('list', { hidden: true }).id);
    expect(screen.getByText('база 50%')).toBeVisible();
    expect(screen.getByText('Механик 3 +15%')).toBeVisible();
    expect(screen.getByText('усталость −5%')).toBeVisible();
    expect(screen.queryByText(/ветер/)).toBeNull();
    await r.user.click(badge);
    expect(badge).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens with Enter and shows an optional label', async () => {
    const r = renderWithSession(<ChanceBadge odds={odds} label="Риск" />, game());
    await r.user.tab();
    expect(screen.getByRole('button', { name: 'Риск · 65%' })).toHaveFocus();
    await r.user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: 'Риск · 65%' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('speaks English', async () => {
    const r = renderWithSession(<ChanceBadge odds={odds} />, { ...game(), lang: 'en' }, 'en');
    await r.user.click(screen.getByRole('button', { name: '65%' }));
    expect(screen.getByText('Mechanic 3 +15%')).toBeVisible();
    expect(screen.getByText('fatigue −5%')).toBeVisible();
  });
});

describe('chance view helpers', () => {
  it('labels sources, with a level only when voices are given', () => {
    const voices = { ...gameAt('planning').voices, order: 2 };
    expect(partLabel('voice.order', 'ru', voices)).toBe('Порядок 2');
    expect(partLabel('voice.order', 'ru')).toBe('Порядок');
    expect(partLabel('base', 'ru')).toBe('база');
    expect(partLabel('clamp', 'en')).toBe('limit');
    expect(partLabel('seabed', 'en')).toBe('seabed');
    expect(partLabel('nonsense', 'en')).toBe('other');
    expect(partLabel('voice.nobody', 'en')).toBe('other');
  });

  it('formats parts with a real minus and hides zero', () => {
    expect(formatPart({ source: 'a', delta: 0.15 })).toBe('+15%');
    expect(formatPart({ source: 'a', delta: -0.05 })).toBe('−5%');
    expect(formatPart({ source: 'a', delta: 0.004 })).toBeNull();
  });
});
