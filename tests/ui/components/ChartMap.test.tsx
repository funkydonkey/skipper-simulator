import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartMap, trailPath } from '../../../src/ui/components/chart/ChartMap';
import { content } from '../fixtures';
import { renderWithSession } from '../render';

/** Caveat at the largest (phone) label size, 24 SVG units: ~0.5 em per glyph, rounded up. */
const WORST_CHAR_PX = 12;

describe('ChartMap', () => {
  it('draws every point name and every route', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" />);
    for (const p of content.map) expect(screen.getByText(p.name.ru)).toBeInTheDocument();
    expect(container.querySelectorAll('[data-route]')).toHaveLength(content.routes.length);
  });

  it('only reachable points are buttons, and they work by click and keyboard', () => {
    const onPointClick = vi.fn();
    renderWithSession(<ChartMap locationId="base_marina" reachableIds={['cala_azzurra']} onPointClick={onPointClick} />);
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]!);
    fireEvent.keyDown(buttons[0]!, { key: 'Enter' });
    expect(onPointClick).toHaveBeenCalledTimes(2);
    expect(onPointClick).toHaveBeenCalledWith('cala_azzurra');
  });

  it('highlights the routes along the trail', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" trail={['base_marina', 'cala_azzurra', 'kastri_marina']} />);
    const lit = [...container.querySelectorAll('[data-highlight="true"]')].map((n) => n.getAttribute('data-route'));
    expect(lit.sort()).toEqual(['r_base_marina_cala_azzurra', 'r_cala_azzurra_kastri_marina']);
  });

  it('draws the wind field but leaves the wind rose to the forecast panel', () => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'N' }} />);
    expect(container.querySelectorAll('[data-wind-arrow]').length).toBeGreaterThan(0);
    expect(container.querySelector('[role="img"]')).toBeNull();
  });

  it('gives every clickable point a large invisible hit circle', () => {
    renderWithSession(<ChartMap locationId="base_marina" reachableIds={['cala_azzurra', 'vela_bay']} onPointClick={() => {}} />);
    for (const b of screen.getAllByRole('button')) {
      const hit = b.querySelector('circle[data-hit]');
      expect(hit).not.toBeNull();
      expect(Number(hit!.getAttribute('r'))).toBeGreaterThanOrEqual(40);
      expect(hit!.getAttribute('fill')).toBe('transparent');
      expect(hit!.getAttribute('pointer-events')).toBe('visible');
    }
  });

  it.each(['ru', 'en'] as const)('keeps every point label inside the chart (%s)', (lang) => {
    const { container } = renderWithSession(<ChartMap locationId="base_marina" />, null, lang);
    const width = Number(container.querySelector('svg')!.getAttribute('viewBox')!.split(' ')[2]);
    const labels = [...container.querySelectorAll<SVGTextElement>('text[class*="label"]')];
    expect(labels).toHaveLength(content.map.length);
    for (const label of labels) {
      const px = Number(/translate\((-?[\d.]+)/.exec(label.parentElement!.getAttribute('transform')!)![1]);
      const x = px + Number(label.getAttribute('x'));
      const w = (label.textContent ?? '').length * WORST_CHAR_PX;
      const [left, right] = label.getAttribute('text-anchor') === 'end' ? [x - w, x] : [x, x + w];
      expect(left, label.textContent!).toBeGreaterThanOrEqual(0);
      expect(right, label.textContent!).toBeLessThanOrEqual(width);
    }
  });

  it('builds an SVG path through trail points', () => {
    expect(trailPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5');
  });
});
