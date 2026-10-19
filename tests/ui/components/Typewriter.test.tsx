import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitLines, Typewriter } from '../../../src/ui/components/Typewriter';

const TEXT = 'Ветер свежеет. На западе тучи! Что делаем?';
const shownFlags = (c: HTMLElement) => [...c.querySelectorAll('[data-shown]')].map((n) => n.getAttribute('data-shown'));

describe('Typewriter', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('splits text into sentences', () => {
    expect(splitLines(TEXT)).toEqual(['Ветер свежеет.', 'На западе тучи!', 'Что делаем?']);
  });

  it('reveals one line per tick and keeps the full text in the DOM', () => {
    vi.useFakeTimers();
    const { container, getByText } = render(<Typewriter text={TEXT} msPerLine={500} />);
    expect(getByText(/Что делаем\?/)).toBeInTheDocument();
    expect(shownFlags(container)).toEqual(['true', 'false', 'false']);
    act(() => { vi.advanceTimersByTime(500); });
    expect(shownFlags(container)).toEqual(['true', 'true', 'false']);
    act(() => { vi.advanceTimersByTime(500); });
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });

  it('click shows everything at once', () => {
    const { container } = render(<Typewriter text={TEXT} />);
    fireEvent.click(container.firstElementChild!);
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });

  it('shows everything at once when the user prefers reduced motion', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }));
    const { container } = render(<Typewriter text={TEXT} />);
    expect(shownFlags(container)).toEqual(['true', 'true', 'true']);
  });
});
