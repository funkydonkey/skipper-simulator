import { describe, expect, it } from 'vitest';
import type { LogEntry } from '../../../src/engine';
import { sumDeltas, timeSpentHours } from '../../../src/ui/screens/event/deltas';

const e = (delta: LogEntry['delta'], data?: LogEntry['data']): LogEntry => ({ day: 1, clockMin: 0, kind: 'effect', cause: 'x', ...(delta ? { delta } : {}), ...(data ? { data } : {}) });

describe('outcome deltas', () => {
  it('sums resource changes across entries and drops zeros', () => {
    expect(sumDeltas([e({ mood: -10, fatigue: 5 }), e({ mood: 4 }), e({ moneyEur: 0 })])).toEqual({ mood: -6, fatigue: 5 });
  });

  it('adds up time spent', () => {
    expect(timeSpentHours([e(undefined, { time_hours: 1.5 }), e(undefined, { time_hours: 2 }), e({ mood: 1 })])).toBe(3.5);
  });
});
