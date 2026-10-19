import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CHECKPOINT_NAMES } from '../../../src/ui/i18n/glossary';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

const point = (id: keyof typeof CHECKPOINT_NAMES) => screen.getByRole('button', { name: new RegExp(CHECKPOINT_NAMES[id].ru) });

describe('CheckinScreen', () => {
  it('spends the attention budget and blocks what does not fit', async () => {
    const r = renderShell(gameAt('checkin'));
    expect(screen.getByText('Время на приёмку: 0 из 90 мин')).toBeInTheDocument();
    for (const id of ['impeller', 'sails', 'electrics', 'anchor', 'gas'] as const) await r.user.click(point(id));
    expect(screen.getByText('Время на приёмку: 90 из 90 мин')).toBeInTheDocument();
    expect(point('toilets')).toBeDisabled();
    expect(point('impeller')).toHaveAttribute('aria-pressed', 'true');
    await r.user.click(point('impeller'));
    expect(point('toilets')).toBeEnabled();
  });

  it('finishes check-in and records the checked points', async () => {
    const r = renderShell(gameAt('checkin'));
    await r.user.click(point('toilets'));
    await r.user.click(screen.getByRole('button', { name: 'Закончить приёмку' }));
    expect(r.currentScreen()).toBe('briefing');
    expect(r.session().game!.flags['checkin.toilets']).toBe(true);
  });
});
