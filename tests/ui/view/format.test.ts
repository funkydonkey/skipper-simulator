import { describe, expect, it } from 'vitest';
import { formatDuration } from '../../../src/ui/view/format';

describe('formatDuration', () => {
  it('says anything under an hour in minutes', () => {
    expect(formatDuration(0.75, 'ru')).toBe('45 мин');
    expect(formatDuration(0.25, 'en')).toBe('15 min');
    expect(formatDuration(0.5, 'ru')).toBe('30 мин');
  });

  it('says whole hours without minutes', () => {
    expect(formatDuration(2, 'ru')).toBe('2 ч');
    expect(formatDuration(1, 'en')).toBe('1 h');
  });

  it('says hours and the remaining minutes', () => {
    expect(formatDuration(1.5, 'ru')).toBe('1 ч 30 мин');
    expect(formatDuration(2.4, 'en')).toBe('2 h 24 min');
  });

  it('rounds to whole minutes and carries a full hour', () => {
    expect(formatDuration(0.999, 'ru')).toBe('1 ч');
    expect(formatDuration(1.004, 'ru')).toBe('1 ч');
  });

  it('shows zero and negative input as zero minutes', () => {
    expect(formatDuration(0, 'ru')).toBe('0 мин');
    expect(formatDuration(-1, 'en')).toBe('0 min');
  });
});
