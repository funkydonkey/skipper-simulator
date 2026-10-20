import { rollChance } from './chance';
import type { CondContext } from './expr';
import { anchorFailSpec, marinaRefusalSpec } from './odds';
import { nextRange, type RngResult } from './rng';
import { clamp } from './state';
import type { Balance, ChanceValue } from './types';

/** `hit` = the anchor dragged on that attempt. */
export interface AnchorRoll { hit: boolean; odds: ChanceValue }

/** Context: `place.seabed`, `wind` (kLocal 1), `night`, `briefing.anchor` (see buildConditionContext). */
export function anchoring(
  rng: number, ctx: CondContext, b: Balance,
): RngResult<{ attempts: number; minutes: number; held: boolean; rolls: AnchorRoll[] }> {
  const spec = anchorFailSpec(b);
  const rolls: AnchorRoll[] = [];
  let next = rng;
  let minutes = 0;
  for (let attempt = 1; attempt <= b.time.anchorMaxAttempts; attempt++) {
    const dur = nextRange(next, b.time.anchorMin[0], b.time.anchorMin[1]);
    const roll = rollChance(dur.next, spec, ctx);
    next = roll.next;
    minutes += dur.value;
    rolls.push(roll.value);
    if (!roll.value.hit) return { value: { attempts: attempt, minutes: Math.round(minutes), held: true, rolls }, next };
  }
  return { value: { attempts: b.time.anchorMaxAttempts, minutes: Math.round(minutes), held: false, rolls }, next };
}

/** Sets `marina.late` on the given context for the refusal roll. */
export function marinaArrival(
  rng: number,
  i: { arrivalHour: number; placesGoneHour: number | null },
  ctx: CondContext,
  b: Balance,
): RngResult<{ refused: boolean; waitMin: number; odds: ChanceValue }> {
  const late = i.placesGoneHour !== null && i.arrivalHour > i.placesGoneHour;
  const roll = rollChance(rng, marinaRefusalSpec(b), { ...ctx, 'marina.late': late });
  return { value: { refused: roll.value.hit, waitMin: late ? b.time.marinaWaitMin : 0, odds: roll.value.odds }, next: roll.next };
}

export function restHours(clockMin: number, b: Balance): number {
  return clamp(b.time.sunsetHour - clockMin / 60, 0, b.mood.restCapHours);
}

const MIN_PER_HOUR = 60;
const HOURS_PER_DAY = 24;

/** `HH:MM`, or `HH:MM +1` past midnight. */
export function formatClock(clockMin: number): string {
  const total = Math.round(clockMin);
  const h = Math.floor(total / MIN_PER_HOUR);
  const m = total % MIN_PER_HOUR;
  const nextDay = h >= HOURS_PER_DAY ? ' +1' : '';
  return `${String(h % HOURS_PER_DAY).padStart(2, '0')}:${String(m).padStart(2, '0')}${nextDay}`;
}
