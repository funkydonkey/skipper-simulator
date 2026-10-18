import { chance, nextRange, type RngResult } from './rng';
import { clamp } from './state';
import type { Balance, Seabed } from './types';

export function anchorFailChance(seabed: Seabed, windKn: number, briefed: boolean, b: Balance): number {
  const [lo, hi] = b.time.anchorFailChance;
  const base = lo + (hi - lo) * b.time.seabedFailFactor[seabed];
  const wind = windKn >= b.time.anchorWindPenaltyKn ? b.time.anchorWindPenalty : 0;
  const brief = briefed ? b.time.anchorBriefedReduction : 0;
  return clamp(base + wind - brief, 0, 0.95);
}

export function anchoring(
  rng: number,
  i: { seabed: Seabed; windKn: number; briefed: boolean },
  b: Balance,
): RngResult<{ attempts: number; minutes: number; held: boolean }> {
  const fail = anchorFailChance(i.seabed, i.windKn, i.briefed, b);
  let next = rng;
  let minutes = 0;
  for (let attempt = 1; attempt <= b.time.anchorMaxAttempts; attempt++) {
    const dur = nextRange(next, b.time.anchorMin[0], b.time.anchorMin[1]);
    const roll = chance(dur.next, fail);
    next = roll.next;
    minutes += dur.value;
    if (!roll.value) return { value: { attempts: attempt, minutes: Math.round(minutes), held: true }, next };
  }
  return { value: { attempts: b.time.anchorMaxAttempts, minutes: Math.round(minutes), held: false }, next };
}

export function marinaArrival(
  rng: number,
  i: { arrivalHour: number; placesGoneHour: number | null },
  b: Balance,
): RngResult<{ refused: boolean; waitMin: number }> {
  const late = i.placesGoneHour !== null && i.arrivalHour > i.placesGoneHour;
  const roll = chance(rng, late ? b.time.marinaLateRefusalChance : 0);
  return { value: { refused: roll.value, waitMin: late ? b.time.marinaWaitMin : 0 }, next: roll.next };
}

export function restHours(clockMin: number, b: Balance): number {
  return clamp(b.time.sunsetHour - clockMin / 60, 0, b.mood.restCapHours);
}

export function formatClock(clockMin: number): string {
  const h = Math.floor(clockMin / 60);
  const m = Math.round(clockMin % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
