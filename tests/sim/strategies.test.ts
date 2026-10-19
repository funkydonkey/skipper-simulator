import { describe, expect, it } from 'vitest';
import { expert, newbie } from '../../src/sim/strategies';
import type { DayFacts } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const facts: DayFacts = {
  day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [],
  motorHours: 2, sailHours: 0, autopilotHours: 0, shower: 'normal',
};

describe('strategies', () => {
  it('choose the taverna only while it is open', () => {
    const open = makeState({ phase: 'evening', locationId: 'marina_b', dayFacts: facts, clockMin: 18 * 60 });
    const closed = { ...open, clockMin: content.balance.time.tavernaCloseHour * 60 };
    expect(newbie.evening(open, content).dinner).toBe('taverna');
    expect(newbie.evening(closed, content).dinner).toBe('cook');
    expect(expert.evening(closed, content).dinner).toBe('cook');
  });
});
