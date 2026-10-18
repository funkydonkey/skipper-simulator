import { EngineError } from './errors';
import { chance, type RngResult } from './rng';
import { clamp } from './state';
import { TRAINABLE_VOICES, type Balance, type TrainableVoice, type VoiceId, type VoiceLine } from './types';

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

export function checkChance(level: number, difficulty: number, fatigue: number, b: Balance): number {
  const raw = b.checks.base + (level - difficulty) * b.checks.perLevel - fatigue * b.fatigue.checkPenaltyPerPoint;
  return clamp(raw, b.checks.min, b.checks.max);
}

export function rollCheck(rng: number, level: number, difficulty: number, fatigue: number, b: Balance): RngResult<{ success: boolean; chance: number }> {
  const p = checkChance(level, difficulty, fatigue, b);
  const r = chance(rng, p);
  return { value: { success: r.value, chance: p }, next: r.next };
}

export function audibleLines(lines: readonly VoiceLine[], voices: Record<VoiceId, number>): VoiceLine[] {
  return lines.filter((l) => voices[l.voice] >= l.min_level);
}

export function resourceReadout(value: number, unit: string, approxStep: number, mechanicLevel: number, b: Balance): string {
  if (mechanicLevel >= b.voices.mechanicExactLevel) return `${Math.round(value)}${unit}`;
  return `~${Math.round(value / approxStep) * approxStep}${unit}`;
}

export function maneuverRiskFactor(voices: Record<VoiceId, number>, b: Balance): number {
  const caution = 1 - voices.caution * b.voices.cautionRiskPerLevel;
  const order = 1 - voices.order * b.voices.orderRiskPerLevel;
  return Math.max(0, caution * order);
}

export function cautionTimeFactor(cautionLevel: number, b: Balance): number {
  return 1 + cautionLevel * b.voices.cautionTimePerLevel;
}
