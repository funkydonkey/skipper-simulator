import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChartMap, trailPath } from '../../../src/ui/components/chart/ChartMap';
import { content } from '../fixtures';
import { renderWithSession } from '../render';

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

  it('shows the wind rose when wind is given', () => {
    renderWithSession(<ChartMap locationId="base_marina" wind={{ dir: 'N', kn: 14 }} />);
    expect(screen.getByRole('img', { name: /N.*14/ })).toBeInTheDocument();
  });

  it('builds an SVG path through trail points', () => {
    expect(trailPath([{ x: 0, y: 0 }, { x: 10, y: 5 }])).toBe('M 0 0 L 10 5');
  });
});
