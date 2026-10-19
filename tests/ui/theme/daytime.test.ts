import { describe, expect, it } from 'vitest';
import { daytimeFor } from '../../../src/ui/theme/daytime';
import { content, gameAt } from '../fixtures';

const b = content.balance;
const at = (h: number) => ({ ...gameAt('evening'), clockMin: Math.round(h * 60) });

describe('daytimeFor', () => {
  it('menu and debrief are dawn, setup phases follow evening 0', () => {
    expect(daytimeFor(null, b, 'menu')).toBe('dawn');
    expect(daytimeFor(gameAt('debrief'), b, 'debrief')).toBe('dawn');
    expect(daytimeFor(gameAt('captain'), b, 'captain')).toBe('day');
    expect(daytimeFor(gameAt('briefing'), b, 'briefing')).toBe('dusk');
    expect(daytimeFor(gameAt('morning'), b, 'morning')).toBe('dawn');
  });

  it('follows the clock around sunset', () => {
    expect(daytimeFor(at(14), b, 'evening')).toBe('day');
    expect(daytimeFor(at(b.time.sunsetHour - 1), b, 'evening')).toBe('dusk');
    expect(daytimeFor(at(b.time.sunsetHour + 1), b, 'evening')).toBe('night');
    expect(daytimeFor(at(25), b, 'event')).toBe('night');
  });
});
