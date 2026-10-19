import { describe, expect, it } from 'vitest';
import { mapBounds, projection, routeBetween, routesFrom } from '../../../src/ui/view/map';
import { content } from '../fixtures';

describe('map view', () => {
  it('bounds contain every point with padding', () => {
    const b = mapBounds(content.map, 3);
    for (const p of content.map) {
      expect(p.x).toBeGreaterThanOrEqual(b.minX + 3);
      expect(p.y).toBeLessThanOrEqual(b.maxY - 3);
    }
  });

  it('projects north up and stays inside the viewBox', () => {
    const proj = projection(mapBounds(content.map), 20);
    const south = proj.toSvg({ x: 0, y: -8 });
    const north = proj.toSvg({ x: 0, y: 24 });
    expect(north.y).toBeLessThan(south.y);
    for (const p of content.map) {
      const s = proj.toSvg(p);
      expect(s.x).toBeGreaterThan(0);
      expect(s.x).toBeLessThan(proj.width);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(proj.height);
    }
  });

  it('finds routes from a point in both directions', () => {
    const from = routesFrom(content, 'cala_azzurra').map((r) => r.to.id).sort();
    expect(from).toContain('base_marina');
    expect(from).toContain('kastri_marina');
    expect(routeBetween(content, 'kastri_marina', 'cala_azzurra')?.id).toBe('r_cala_azzurra_kastri_marina');
    expect(routeBetween(content, 'fjord_bay', 'blue_lagoon')).toBeNull();
  });
});
