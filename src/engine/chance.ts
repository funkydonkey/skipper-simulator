import { evaluateCondition, lookupNumber, type CondContext } from './expr';
import { chance } from './rng';
import type { RngResult } from './rng';
import { clamp } from './state';
import type { ChanceInput, ChanceMod, ChancePart, ChanceValue } from './types';

const partSource = (m: ChanceMod): string => m.label ?? m.per ?? 'mod';

/** Magnitude of a mod: add * ctx[per], or mul factor (1 + mul * ctx[per]); without `per` the scale is 1. */
function scale(m: ChanceMod, ctx: CondContext): number {
  return m.per === undefined ? 1 : lookupNumber(ctx, m.per);
}

/** Order: base, adds, muls, clamp. Parts sum to value. */
export function evaluateChance(input: ChanceInput, ctx: CondContext): ChanceValue {
  const spec = typeof input === 'number' ? { base: input } : input;
  const active = (spec.mods ?? []).filter((m) => m.if === undefined || evaluateCondition(m.if, ctx));
  const parts: ChancePart[] = [{ source: 'base', delta: spec.base }];
  let value = spec.base;
  for (const m of active.filter((x) => x.add !== undefined)) {
    const delta = m.add! * scale(m, ctx);
    value += delta;
    parts.push({ source: partSource(m), delta, kind: 'add' });
  }
  for (const m of active.filter((x) => x.mul !== undefined)) {
    const factor = 1 + m.mul! * scale(m, ctx);
    const next = value * factor;
    parts.push({ source: partSource(m), delta: next - value, kind: 'mul', factor });
    value = next;
  }
  const clamped = clamp(value, spec.min ?? 0, spec.max ?? 1);
  if (clamped !== value) parts.push({ source: 'clamp', delta: clamped - value });
  return { value: clamped, parts };
}

/** Always consumes exactly one draw. */
export function rollChance(
  rng: number, input: ChanceInput, ctx: CondContext,
): RngResult<{ hit: boolean; odds: ChanceValue }> {
  const odds = evaluateChance(input, ctx);
  const r = chance(rng, odds.value);
  return { value: { hit: r.value, odds }, next: r.next };
}
