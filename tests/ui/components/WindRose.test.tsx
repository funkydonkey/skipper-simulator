import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { downwindDeg, WindRose } from '../../../src/ui/components/WindRose';
import { headTip, rotatedTip } from '../helpers/arrow';
import { renderWithSession } from '../render';

describe('WindRose', () => {
  it('points the arrow downwind', () => {
    expect(downwindDeg('N')).toBe(180);
    expect(downwindDeg('NW')).toBe(135);
    expect(downwindDeg('S')).toBe(0);
  });

  it.each([
    ['N', 0, 1],
    ['E', -1, 0],
    ['NW', 1, 1],
  ] as const)('draws the arrow head downwind for %s wind', (dir, sx, sy) => {
    const { container } = renderWithSession(<WindRose dir={dir} kn={10} />);
    const head = container.querySelector('path[class*="head"]')!;
    const tip = rotatedTip(head.parentElement!.getAttribute('transform')!, headTip(head.getAttribute('d')!));
    expect(Math.sign(Math.round(tip.x)) + 0).toBe(sx);
    expect(Math.sign(Math.round(tip.y)) + 0).toBe(sy);
  });

  it('labels direction, wind and gusts', () => {
    renderWithSession(<WindRose dir="NW" kn={12} gustKn={18} />);
    expect(screen.getByRole('img', { name: /NW.*12.*18/ })).toBeInTheDocument();
  });
});
