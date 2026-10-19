import { afterEach, describe, expect, it, vi } from 'vitest';
import { SceneArt } from '../../../src/ui/components/SceneArt';
import { renderWithSession } from '../render';

describe('SceneArt placeholder', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('adds stars at night and rain in a storm', () => {
    const night = renderWithSession(<SceneArt scene="anchorage_night" />);
    expect(night.container.querySelector('[data-layer="stars"]')).not.toBeNull();
    night.unmount();
    const storm = renderWithSession(<SceneArt scene="deck_squall" />);
    expect(storm.container.querySelector('[data-layer="rain"]')).not.toBeNull();
    expect(storm.container.querySelector('[data-layer="rain"] animate')).not.toBeNull();
  });

  it('keeps the rain still with reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = renderWithSession(<SceneArt scene="deck_squall" />);
    expect(container.querySelector('[data-layer="rain"]')).not.toBeNull();
    expect(container.querySelector('animate')).toBeNull();
  });
});
