import { describe, expect, it } from 'vitest';
import { fmt } from '../../../src/ui/i18n/t';
import { formatDuration, money, round1, signed } from '../../../src/ui/view/format';

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

describe('numbers in text', () => {
  it('money uses at most two decimals and the language decimal mark', () => {
    expect(money(80.8, 'ru')).toBe('80,8');
    expect(money(80.8, 'en')).toBe('80.8');
    expect(money(120, 'ru')).toBe('120');
    expect(money(3.456, 'ru')).toBe('3,46');
  });

  it('round1 and signed round to one decimal with a true minus', () => {
    expect(round1(7.6234)).toBe(7.6);
    expect(signed(-5)).toBe('−5');
  });

  it('fmt prints negative numbers with the true minus', () => {
    expect(fmt('{n} €', { n: -406 })).toBe('−406 €');
    expect(fmt('{s}', { s: '-5' })).toBe('-5');
  });
});
