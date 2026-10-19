import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { downwindDeg, WindRose } from '../../../src/ui/components/WindRose';
import { renderWithSession } from '../render';

describe('WindRose', () => {
  it('points the arrow downwind', () => {
    expect(downwindDeg('N')).toBe(180);
    expect(downwindDeg('NW')).toBe(135);
    expect(downwindDeg('S')).toBe(0);
  });

  it('labels direction, wind and gusts', () => {
    renderWithSession(<WindRose dir="NW" kn={12} gustKn={18} />);
    expect(screen.getByRole('img', { name: /NW.*12.*18/ })).toBeInTheDocument();
  });
});
