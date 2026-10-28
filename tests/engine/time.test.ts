import { describe, expect, it } from 'vitest';
import { evaluateChance } from '../../src/engine/chance';
import { anchorFailSpec } from '../../src/engine/odds';
import { anchoring, formatClock, marinaArrival, restHours } from '../../src/engine/time';
import type { Seabed } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';

const b = makeContent().balance;
interface AnchorInput { seabed: Seabed; windKn: number; briefed: boolean; night: boolean }
const anchorCtx = (i: AnchorInput) => ({ 'place.seabed': i.seabed, 'place.berth': 'anchor', wind: i.windKn, 'briefing.anchor': i.briefed, night: i.night });
const anchorFailChance = (i: AnchorInput, bal: typeof b): number => evaluateChance(anchorFailSpec(bal), anchorCtx(i)).value;

describe('time budget', () => {
  it('anchor fail chance: seabed, wind, briefing (ТЗ 4.5: 20–40%)', () => {
    const day = { briefed: false, night: false };
    expect(anchorFailChance({ ...day, seabed: 'sand', windKn: 10 }, b)).toBeCloseTo(0.2);
    expect(anchorFailChance({ ...day, seabed: 'rock', windKn: 10 }, b)).toBeCloseTo(0.4);
    expect(anchorFailChance({ ...day, seabed: 'rock', windKn: 20 }, b)).toBeCloseTo(0.5);
    expect(anchorFailChance({ ...day, seabed: 'sand', windKn: 10, briefed: true }, b)).toBeCloseTo(0.1);
  });

  it('anchoring in the dark is harder by time.nightAnchorPenalty', () => {
    expect(anchorFailChance({ seabed: 'sand', windKn: 10, briefed: false, night: true }, b)).toBeCloseTo(0.2 + b.time.nightAnchorPenalty);
  });

  it('anchoring: attempts 1..3, minutes within 30..60 per attempt', () => {
    let s = 5;
    for (let i = 0; i < 300; i++) {
      const r = anchoring(s, anchorCtx({ seabed: 'weed', windKn: 15, briefed: false, night: false }), b);
      expect(r.value.attempts).toBeGreaterThanOrEqual(1);
      expect(r.value.attempts).toBeLessThanOrEqual(3);
      expect(r.value.minutes).toBeGreaterThanOrEqual(30 * r.value.attempts);
      expect(r.value.minutes).toBeLessThanOrEqual(60 * r.value.attempts);
      if (!r.value.held) expect(r.value.attempts).toBe(3);
      s = r.next;
    }
  });

  it('bad seabed + wind needs more attempts than briefed sand', () => {
    const mean = (seabed: 'sand' | 'rock', windKn: number, briefed: boolean): number => {
      let s = 11;
      let total = 0;
      for (let i = 0; i < 1000; i++) {
        const r = anchoring(s, anchorCtx({ seabed, windKn, briefed, night: false }), b);
        total += r.value.attempts;
        s = r.next;
      }
      return total / 1000;
    };
    expect(mean('rock', 20, false)).toBeGreaterThan(mean('sand', 10, true) + 0.3);
  });

  it('marina: late arrival → ~55% refusal and a wait; early → never refused', () => {
    let s = 3;
    let refused = 0;
    for (let i = 0; i < 2000; i++) {
      const r = marinaArrival(s, { arrivalHour: 16, placesGoneHour: 15 }, {}, b);
      if (r.value.refused) refused++;
      expect(r.value.waitMin).toBe(45);
      s = r.next;
    }
    expect(refused / 2000).toBeGreaterThan(0.5);
    expect(refused / 2000).toBeLessThan(0.6);
    expect(marinaArrival(1, { arrivalHour: 14, placesGoneHour: 15 }, {}, b).value).toMatchObject({ refused: false, waitMin: 0 });
    expect(marinaArrival(1, { arrivalHour: 19, placesGoneHour: null }, {}, b).value.refused).toBe(false);
  });

  it('restHours until sunset, capped', () => {
    expect(restHours(17 * 60, b)).toBe(3);
    expect(restHours(13 * 60, b)).toBe(5);
    expect(restHours(21 * 60, b)).toBe(0);
  });

  it('formatClock', () => {
    expect(formatClock(9 * 60 + 5)).toBe('09:05');
    expect(formatClock(17 * 60 + 45)).toBe('17:45');
    expect(formatClock(119.7)).toBe('02:00');
    expect(formatClock(26 * 60 + 8)).toBe('02:08 +1');
    expect(formatClock(51 * 60 + 36)).toBe('03:36 +2');
    expect(formatClock(23 * 60 + 59.6)).toBe('00:00 +1');
  });
});
