import { describe, expect, it } from 'vitest';
import { startDay } from '../../../src/engine/day/morning';
import type { Content } from '../../../src/engine/types';
import { makeContent } from '../../fixtures/content';
import { deepFreeze } from '../../fixtures/freeze';
import { makeState } from '../../fixtures/state';

const content = makeContent();
const frontEveryDay: Content = {
  ...content,
  weather: [{ ...content.weather[0]!, days: content.weather[0]!.days.map((d) => ({ ...d, frontChance: 1 })) }],
};
const morning = (over = {}) => deepFreeze(makeState({ phase: 'morning', weather: null, ...over }));

describe('startDay', () => {
  it('rolls weather and moves to planning', () => {
    const s = startDay(morning(), content, { openBarometer: false });
    expect(s.phase).toBe('planning');
    expect(s.weather).toMatchObject({ day: 1, forecastKn: 12, forecastDir: 'NW', front: false });
    expect(s.rng).not.toBe(42);
    expect(s.log.map((e) => e.cause)).toContain('barometer:ignored');
  });

  it('front is visible with sea sense or an opened barometer → signal logged', () => {
    const seen = startDay(morning(), frontEveryDay, { openBarometer: false });
    expect(seen.weather!.signalsVisible).toBe(true);
    expect(seen.log.map((e) => e.cause)).toContain('signal:front');
    const blind = startDay(morning({ voices: { ...makeState().voices, sea_sense: 0 } }), frontEveryDay, { openBarometer: false });
    expect(blind.weather!.front).toBe(true);
    expect(blind.log.map((e) => e.cause)).not.toContain('signal:front');
    const opened = startDay(morning({ voices: { ...makeState().voices, sea_sense: 0 } }), frontEveryDay, { openBarometer: true });
    expect(opened.log.map((e) => e.cause)).toEqual(expect.arrayContaining(['barometer:open', 'signal:front']));
  });

  it('morning line creates a same-day expectation', () => {
    const s = startDay(morning(), content, { openBarometer: true, dialogueId: 'early_try' });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'early_try', dueDay: 1 })]);
  });

  it('rejects wrong phase (Review Focus #5)', () => {
    expect(() => startDay(makeState(), content, { openBarometer: false })).toThrow(/Expected phase morning/);
  });
});
