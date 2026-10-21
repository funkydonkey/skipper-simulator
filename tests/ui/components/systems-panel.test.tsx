import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SystemsPanel } from '../../../src/ui/components/SystemsPanel';
import { content } from '../fixtures';

describe('SystemsPanel', () => {
  const systems = {
    engine_cooling: { state: 'ok' as const },
    rig: { state: 'worn' as const },
    heads: { state: 'new' as const, broken: true },
  };

  it('lists a broken system first and labels the list', () => {
    render(<SystemsPanel systems={systems} content={content} lang="ru" />);
    const list = screen.getByRole('list', { name: 'Системы лодки' });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent(/Гальюны|Гальюн/);
    expect(rows[0]).toHaveTextContent('сломано');
    expect(rows[0]).toHaveAttribute('data-broken', 'true');
  });

  it('shows state words in English', () => {
    render(<SystemsPanel systems={systems} content={content} lang="en" />);
    expect(screen.getByRole('list', { name: 'Boat systems' })).toBeInTheDocument();
    expect(screen.getByText('worn')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
    expect(screen.getByText('broken')).toBeInTheDocument();
  });
});
