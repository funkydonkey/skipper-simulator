import { describe, expect, it } from 'vitest';
import { appendLog, causeMatches, findLog } from '../../src/engine/log';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

describe('log', () => {
  it('appendLog stamps day/clock and does not mutate', () => {
    const s = deepFreeze(makeState({ day: 2, clockMin: 600 }));
    const next = appendLog(s, { kind: 'decision', cause: 'plan:depart:late', pillar: 'time' });
    expect(s.log).toHaveLength(0);
    expect(next.log).toEqual([{ kind: 'decision', cause: 'plan:depart:late', pillar: 'time', day: 2, clockMin: 600 }]);
  });

  it('causeMatches works on segment boundaries', () => {
    expect(causeMatches('event:toilet_clog', 'event:toilet_clog')).toBe(true);
    expect(causeMatches('event:toilet_clog:fix_self:fail', 'event:toilet_clog')).toBe(true);
    expect(causeMatches('event:toilet_clog_extra', 'event:toilet_clog')).toBe(false);
    expect(causeMatches('maneuver:dep:release_before_neutral', 'maneuver')).toBe(true);
  });

  it('findLog filters by pattern', () => {
    let s = makeState();
    s = appendLog(s, { kind: 'effect', cause: 'zero:water' });
    s = appendLog(s, { kind: 'effect', cause: 'zero:starter' });
    s = appendLog(s, { kind: 'effect', cause: 'rest' });
    expect(findLog(s.log, 'zero').map((e) => e.cause)).toEqual(['zero:water', 'zero:starter']);
  });
});
