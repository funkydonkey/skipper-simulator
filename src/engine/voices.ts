import { evaluateChance, rollChance } from './chance';
import { EngineError } from './errors';
import type { CondContext } from './expr';
import { checkSpec } from './odds';
import type { RngResult } from './rng';
import { TRAINABLE_VOICES, type Balance, type ChanceValue, type TrainableVoice, type VoiceCheck, type VoiceId, type VoiceLine } from './types';

export function validateAllocation(alloc: Partial<Record<string, number>>, b: Balance): string[] {
  const errors: string[] = [];
  let sum = 0;
  for (const [voice, level] of Object.entries(alloc)) {
    if (!(TRAINABLE_VOICES as readonly string[]).includes(voice)) { errors.push(`${voice} is not trainable`); continue; }
    if (level === undefined || !Number.isInteger(level)) { errors.push(`${voice} must be an integer`); continue; }
    if (level < 0 || level > b.voices.maxLevel) errors.push(`${voice} must be in 0..${b.voices.maxLevel}`);
    sum += level;
  }
  if (sum !== b.voices.points) errors.push(`sum must be ${b.voices.points}, got ${sum}`);
  return errors;
}

export function initialVoices(alloc: Partial<Record<TrainableVoice, number>>, b: Balance): Record<VoiceId, number> {
  const errors = validateAllocation(alloc, b);
  if (errors.length) throw new EngineError('INVALID_INPUT', `Invalid voice allocation: ${errors.join('; ')}`);
  return {
    sea_sense: alloc.sea_sense ?? 0,
    caution: alloc.caution ?? 0,
    order: alloc.order ?? 0,
    mechanic: alloc.mechanic ?? 0,
    diplomat: alloc.diplomat ?? 0,
    economist: alloc.economist ?? 0,
    pride: b.voices.prideLevel,
    crew_voice: b.voices.crewVoiceLevel,
  };
}

/** Context needs `voice.<check.voice>` and `fatigue` (see buildConditionContext). */
export function checkChance(check: VoiceCheck, ctx: CondContext, b: Balance): ChanceValue {
  return evaluateChance(checkSpec(check, b), ctx);
}

export function rollCheck(rng: number, check: VoiceCheck, ctx: CondContext, b: Balance): RngResult<{ success: boolean; odds: ChanceValue }> {
  const r = rollChance(rng, checkSpec(check, b), ctx);
  return { value: { success: r.value.hit, odds: r.value.odds }, next: r.next };
}

export function audibleLines(lines: readonly VoiceLine[], voices: Record<VoiceId, number>): VoiceLine[] {
  return lines.filter((l) => voices[l.voice] >= l.min_level);
}

export function resourceReadout(value: number, unit: string, approxStep: number, mechanicLevel: number, b: Balance): string {
  if (mechanicLevel >= b.voices.mechanicExactLevel) return `${Math.round(value)}${unit}`;
  return `~${Math.round(value / approxStep) * approxStep}${unit}`;
}

export function cautionTimeFactor(cautionLevel: number, b: Balance): number {
  return 1 + cautionLevel * b.voices.cautionTimePerLevel;
}
