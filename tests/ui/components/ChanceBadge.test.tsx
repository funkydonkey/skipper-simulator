import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ChanceValue } from '../../../src/engine';
import { ChanceBadge } from '../../../src/ui/components/ChanceBadge';
import { chanceRows, formatPart, partLabel } from '../../../src/ui/view/chance';
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
    const r = renderWithSession(<ChanceBadge odds={odds} voices={game().voices} />, game());
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

  it('labels voice parts without a level when no voices are passed (past rolls in the logbook)', async () => {
    const r = renderWithSession(<ChanceBadge odds={odds} />, game());
    await r.user.click(screen.getByRole('button', { name: '65%' }));
    expect(screen.getByText('Механик +15%')).toBeVisible();
  });

  it('puts an optional id on the badge button so an option can describe itself with it', () => {
    renderWithSession(<ChanceBadge odds={odds} id="opt-1-odds" />, game());
    expect(screen.getByRole('button', { name: '65%' })).toHaveAttribute('id', 'opt-1-odds');
    expect(screen.getByRole('list', { hidden: true })).not.toHaveAttribute('aria-label');
  });

  it('speaks English', async () => {
    const r = renderWithSession(<ChanceBadge odds={odds} voices={game().voices} />, { ...game(), lang: 'en' }, 'en');
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
    expect(partLabel('berth', 'ru')).toBe('кормовой на берег');
    expect(partLabel('berth', 'en')).toBe('stern line ashore');
    expect(partLabel('nonsense', 'en')).toBe('other');
    expect(partLabel('voice.nobody', 'en')).toBe('other');
  });

  it('formats add parts in points with a real minus and hides zero', () => {
    expect(formatPart({ source: 'a', delta: 0.15, kind: 'add' }, 'ru')).toBe('+15%');
    expect(formatPart({ source: 'a', delta: -0.05 }, 'ru')).toBe('−5%');
    expect(formatPart({ source: 'a', delta: 0.004, kind: 'add' }, 'ru')).toBeNull();
    expect(formatPart({ source: 'base', delta: 0.25 }, 'ru')).toBe('25%');
  });

  it('formats mul parts as the relative change they make, like the captain screen', () => {
    expect(formatPart({ source: 'voice.caution', delta: -0.04, kind: 'mul', factor: 0.84 }, 'ru')).toBe('−16%');
    expect(formatPart({ source: 'night', delta: 0.1, kind: 'mul', factor: 1.5 }, 'en')).toBe('+50%');
  });

  it('never hides a voice part: small ones get a decimal, zero ones show 0%', () => {
    expect(formatPart({ source: 'voice.order', delta: -0.0004, kind: 'mul', factor: 0.996 }, 'ru')).toBe('−0,4%');
    expect(formatPart({ source: 'voice.order', delta: -0.0004, kind: 'mul', factor: 0.996 }, 'en')).toBe('−0.4%');
    expect(formatPart({ source: 'voice.mechanic', delta: 0.003, kind: 'add' }, 'en')).toBe('+0.3%');
    expect(formatPart({ source: 'voice.caution', delta: 0, kind: 'mul', factor: 1 }, 'en')).toBe('0%');
  });

  it('builds breakdown rows, with voice levels only when voices are given', () => {
    const mixed: ChanceValue = { value: 0.21, parts: [
      { source: 'base', delta: 0.25 },
      { source: 'voice.caution', delta: -0.04, kind: 'mul', factor: 0.84 },
      { source: 'wind', delta: 0.001, kind: 'add' },
    ] };
    const voices = { ...gameAt('planning').voices, caution: 2 };
    expect(chanceRows(mixed, 'ru', voices).map((r) => r.text)).toEqual(['база 25%', 'Осторожность 2 −16%']);
    expect(chanceRows(mixed, 'ru').map((r) => r.text)).toEqual(['база 25%', 'Осторожность −16%']);
  });

  it('does not treat object prototype keys as known sources', () => {
    expect(partLabel('toString', 'en')).toBe('other');
    expect(partLabel('constructor', 'ru')).toBe('прочее');
  });
});
