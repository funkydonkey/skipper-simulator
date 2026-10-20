import { describe, expect, it } from 'vitest';
import { ChanceInputSchema } from '../../src/content/schema';
import { evaluateChance, rollChance } from '../../src/engine/chance';
import { EngineError } from '../../src/engine/errors';
import { nextFloat } from '../../src/engine/rng';

const sum = (parts: { delta: number }[]): number => parts.reduce((s, p) => s + p.delta, 0);

describe('evaluateChance', () => {
  it('plain number is a single base part', () => {
    expect(evaluateChance(0.3, {})).toEqual({ value: 0.3, parts: [{ source: 'base', delta: 0.3 }] });
  });

  it('add mods scale by per key and use label or key as source', () => {
    const r = evaluateChance(
      { base: 0.5, mods: [{ per: 'voice.order', add: 0.15 }, { per: 'fatigue', add: -0.004, label: 'fatigue' }] },
      { 'voice.order': 2, fatigue: 25 },
    );
    expect(r.value).toBeCloseTo(0.7, 9);
    expect(r.parts.map((p) => p.source)).toEqual(['base', 'voice.order', 'fatigue']);
    expect(r.parts[0]!.delta).toBeCloseTo(0.5, 9);
    expect(r.parts[1]!.delta).toBeCloseTo(0.3, 9);
    expect(r.parts[2]!.delta).toBeCloseTo(-0.1, 9);
  });

  it('mul mods apply factor (1 + mul*ctx) and parts sum to value', () => {
    const r = evaluateChance(
      { base: 0.2, mods: [{ per: 'voice.caution', mul: -0.08 }, { per: 'voice.order', mul: -0.1 }] },
      { 'voice.caution': 2, 'voice.order': 1 },
    );
    expect(r.value).toBeCloseTo(0.2 * 0.84 * 0.9, 9);
    expect(sum(r.parts)).toBeCloseTo(r.value, 9);
  });

  it('marks parts as add or mul, and mul parts carry their factor', () => {
    const r = evaluateChance(
      { base: 0.25, mods: [{ add: 0.05, label: 'wind' }, { per: 'voice.caution', mul: -0.08 }] },
      { 'voice.caution': 2 },
    );
    expect(r.parts[0]).toEqual({ source: 'base', delta: 0.25 });
    expect(r.parts[1]).toMatchObject({ source: 'wind', kind: 'add' });
    expect(r.parts[1]!.factor).toBeUndefined();
    expect(r.parts[2]).toMatchObject({ source: 'voice.caution', kind: 'mul' });
    expect(r.parts[2]!.factor).toBeCloseTo(0.84, 9);
    expect(r.parts[2]!.delta).toBeCloseTo(0.3 * -0.16, 9);
    expect(sum(r.parts)).toBeCloseTo(r.value, 9);
  });

  it('applies all adds before all muls', () => {
    const r = evaluateChance({ base: 0.2, mods: [{ mul: -0.5, label: 'night' }, { add: 0.2, label: 'wind' }] }, {});
    expect(r.value).toBeCloseTo(0.2, 9);
    expect(r.parts.map((p) => p.source)).toEqual(['base', 'wind', 'night']);
  });

  it('omits mods gated off by if', () => {
    const r = evaluateChance({ base: 0.3, mods: [{ if: 'flag.x', add: 0.2, label: 'wind' }] }, {});
    expect(r).toEqual({ value: 0.3, parts: [{ source: 'base', delta: 0.3 }] });
    const on = evaluateChance({ base: 0.3, mods: [{ if: 'flag.x', add: 0.2, label: 'wind' }] }, { 'flag.x': true });
    expect(on.value).toBeCloseTo(0.5, 9);
  });

  it('clamps and records a clamp part', () => {
    const r = evaluateChance({ base: 0.9, mods: [{ add: 0.3, label: 'wind' }], max: 0.95 }, {});
    expect(r.value).toBe(0.95);
    expect(r.parts.at(-1)).toEqual({ source: 'clamp', delta: expect.closeTo(-0.25, 9) });
    expect(sum(r.parts)).toBeCloseTo(0.95, 9);
  });

  it('defaults clamp to [0, 1]', () => {
    expect(evaluateChance({ base: 0.1, mods: [{ add: -0.5, label: 'fatigue' }] }, {}).value).toBe(0);
  });

  it('falls back to source "mod" when neither label nor per is given', () => {
    expect(evaluateChance({ base: 0.1, mods: [{ add: 0.1 }] }, {}).parts[1]!.source).toBe('mod');
  });

  it('unknown or non-numeric per key throws CONTENT', () => {
    const bad = (ctx: Record<string, number | string>): unknown => () =>
      evaluateChance({ base: 0.1, mods: [{ per: 'nope', add: 1 }] }, ctx);
    expect(bad({}) as () => void).toThrow(EngineError);
    expect(bad({}) as () => void).toThrow(/nope/);
    expect(bad({ nope: 'x' }) as () => void).toThrow(EngineError);
  });
});

describe('rollChance', () => {
  it('consumes exactly one draw whatever the value', () => {
    const expected = nextFloat(42).next;
    for (const input of [0, 1, 0.5, { base: 0.5, mods: [{ add: 0.1, label: 'wind' as const }] }]) {
      expect(rollChance(42, input, {}).next).toBe(expected);
    }
  });

  it('returns hit and odds', () => {
    const draw = nextFloat(7).value;
    const r = rollChance(7, draw + 0.01, {});
    expect(r.value.hit).toBe(true);
    expect(r.value.odds.value).toBeCloseTo(draw + 0.01, 9);
    expect(rollChance(7, draw - 0.01, {}).value.hit).toBe(false);
  });
});

describe('ChanceInputSchema', () => {
  it('accepts a number and a spec', () => {
    expect(ChanceInputSchema.safeParse(0.3).success).toBe(true);
    expect(ChanceInputSchema.safeParse({ base: 0.5, mods: [{ per: 'fatigue', add: -0.004 }, { mul: 0.1, label: 'wind' }], max: 0.9 }).success).toBe(true);
  });
  it('rejects a mod with both add and mul, or neither', () => {
    expect(ChanceInputSchema.safeParse({ base: 0.5, mods: [{ add: 0.1, mul: 0.1, label: 'wind' }] }).success).toBe(false);
    expect(ChanceInputSchema.safeParse({ base: 0.5, mods: [{ label: 'wind' }] }).success).toBe(false);
  });
  it('requires label when per is absent, and rejects unknown labels', () => {
    expect(ChanceInputSchema.safeParse({ base: 0.5, mods: [{ add: 0.1 }] }).success).toBe(false);
    expect(ChanceInputSchema.safeParse({ base: 0.5, mods: [{ add: 0.1, label: 'bogus' }] }).success).toBe(false);
  });
});
