import { describe, expect, it, vi } from 'vitest';
import { ChartMap } from '../../../src/ui/components/chart/ChartMap';
import { hashId, islandPath, landOffset } from '../../../src/ui/components/chart/decor';
import { content } from '../fixtures';
import { chevronTip, rotatedTip } from '../helpers/arrow';
import { renderWithSession } from '../render';

describe('chart decor', () => {
  it('islands are deterministic per point and differ between points', () => {
    expect(islandPath('vela_bay', 100, 100, 30)).toBe(islandPath('vela_bay', 100, 100, 30));
    expect(islandPath('vela_bay', 100, 100, 30)).not.toBe(islandPath('fjord_bay', 100, 100, 30));
    expect(hashId('a')).not.toBe(hashId('b'));
  });

  it('puts land on the sheltered side', () => {
    const vela = content.map.find((p) => p.id === 'vela_bay')!;
    const o = landOffset(vela);
    expect(o.dx).toBeGreaterThan(0);
    expect(Math.hypot(o.dx, o.dy)).toBeCloseTo(1, 5);
  });

  it('draws defs, one coastline per point and animated water', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'NW' }} />);
    expect(container.querySelector('filter#hand')).not.toBeNull();
    expect(container.querySelectorAll('[data-coast]')).toHaveLength(content.map.length);
    expect(container.querySelector('animateTransform')).not.toBeNull();
    expect(container.querySelectorAll('[data-wind-arrow]').length).toBeGreaterThan(4);
  });

  it('keeps everything still with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = renderWithSession(<ChartMap locationId="base_marina" />);
    expect(container.querySelector('animateTransform, animateMotion, animate')).toBeNull();
    vi.unstubAllGlobals();
  });

  it('keeps decor layers non-interactive so they never block point clicks', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'NW' }} />);
    for (const cls of ['water', 'clouds', 'windField']) {
      const g = container.querySelector(`g[class*="${cls}"]`);
      expect(g, cls).not.toBeNull();
      expect(g!.getAttribute('pointer-events'), cls).toBe('none');
    }
  });

  it.each([
    ['N', 0, 1],
    ['W', 1, 0],
    ['NW', 1, 1],
  ] as const)('wind field arrows point downwind for %s wind', (dir, sx, sy) => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" wind={{ dir }} />);
    for (const a of container.querySelectorAll('[data-wind-arrow]')) {
      const tip = rotatedTip(a.getAttribute('transform')!, chevronTip(a.getAttribute('d')!));
      expect(Math.sign(Math.round(tip.x)) + 0).toBe(sx);
      expect(Math.sign(Math.round(tip.y)) + 0).toBe(sy);
    }
  });
});
