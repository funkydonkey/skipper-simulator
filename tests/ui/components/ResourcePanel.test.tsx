import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourcePanel } from '../../../src/ui/components/ResourcePanel';
import { SessionProvider } from '../../../src/ui/session/SessionContext';
import { memoryStorage } from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';

describe('ResourcePanel', () => {
  it('shows day, place, clock and every resource', () => {
    const game = { ...gameAt('planning'), damages: ['hull_scratch'] };
    render(
      <SessionProvider content={content} storage={memoryStorage()} initialLang="ru" initialGame={game}>
        <ResourcePanel />
      </SessionProvider>,
    );
    expect(screen.getByText(/День 1 из 6/)).toBeInTheDocument();
    expect(screen.getByText('Вода')).toBeInTheDocument();
    expect(screen.getByText('Усталость капитана')).toBeInTheDocument();
    expect(screen.getByText(/Царапина на корпусе/)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').length).toBeGreaterThanOrEqual(8);
  });
});
