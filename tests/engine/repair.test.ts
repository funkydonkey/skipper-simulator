import { describe, expect, it } from 'vitest';
import { EngineError } from '../../src/engine/errors';
import { repairOptions, repairSystem } from '../../src/engine/repair';
import type { Content, GameState, RepairOption } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const self: RepairOption = {
  id: 'self', label: { ru: 'Сами', en: 'Self' }, check: { voice: 'mechanic', difficulty: 2 }, costEur: 40, timeHours: 1,
};
const base = makeContent();
const content: Content = {
  ...base,
  systems: base.systems.map((d) => (d.id === 'engine_cooling'
    ? { ...d, repairs: [self, { ...d.repairs[0]!, costEur: 220, timeHours: 3 }] }
    : d)),
};
const broken = (over: Partial<GameState> = {}): GameState => {
  const s = makeState();
  return makeState({
    locationId: 'bay_a',
    dayFacts: { day: 1, departureHour: 9, arrivalHour: 12, arrivalPointKind: 'bay', mooring: 'anchor', activities: [], motorHours: 0, sailHours: 0, autopilotHours: 0, maxWindKn: 10, shower: 'normal' },
    systems: { ...s.systems, engine_cooling: { state: 'worn', wear: 5, broken: true } },
    ...over,
  });
};
const berth = (over: Partial<GameState> = {}): GameState => {
  const s = broken(over);
  return { ...s, dayFacts: { ...s.dayFacts!, mooring: 'berth' } };
};
/** First rng value (from 1) whose self-repair roll gives the wanted result. */
const withRoll = (success: boolean): GameState => {
  for (let rng = 1; rng < 500; rng++) {
    const s = repairSystem(broken({ rng }), content, 'engine_cooling', 'self');
    if (s.systems.engine_cooling!.broken === !success) return broken({ rng });
  }
  throw new Error('no seed');
};
const code = (f: () => unknown): string | undefined => {
  try { f(); } catch (e) { return e instanceof EngineError ? e.code : 'other'; }
  return undefined;
};

describe('repairOptions', () => {
  it('lists nothing when no system is broken', () => {
    expect(repairOptions(makeState(), content)).toEqual([]);
  });

  it('at anchor: self available with odds, service unavailable (requires)', () => {
    const [a, b] = repairOptions(broken(), content);
    expect(a).toMatchObject({ systemId: 'engine_cooling', available: true });
    expect(a!.option.id).toBe('self');
    expect(a!.odds!.value).toBeGreaterThan(0);
    expect(b).toMatchObject({ available: false, reason: 'requires' });
    expect(b!.odds).toBeUndefined();
  });

  it('too little money makes self unavailable (no_money)', () => {
    const s = broken();
    const [a] = repairOptions({ ...s, resources: { ...s.resources, moneyEur: 10 } }, content);
    expect(a).toMatchObject({ available: false, reason: 'no_money' });
  });

  it('odds equal the odds logged by repairSystem', () => {
    const s = deepFreeze(broken({ rng: 7 }));
    const shown = repairOptions(s, content)[0]!.odds!;
    const after = repairSystem(s, content, 'engine_cooling', 'self');
    const roll = after.log.find((e) => e.cause === 'roll:check:repair:engine_cooling:self')!;
    expect(roll).toMatchObject({ kind: 'roll', pillar: 'boat' });
    expect(roll.odds).toEqual(shown);
  });
});

describe('repairSystem', () => {
  it('a failed self repair keeps broken, still charges and grants fail XP', () => {
    const s = withRoll(false);
    const r = repairSystem(deepFreeze(s), content, 'engine_cooling', 'self');
    expect(r.systems.engine_cooling).toEqual({ state: 'worn', wear: 5, broken: true });
    expect(r.resources.moneyEur).toBe(s.resources.moneyEur - 40);
    expect(r.clockMin).toBe(s.clockMin + 60);
    expect(r.voiceXp.mechanic).toBe(content.balance.voices.checkXp.fail);
    expect(r.log.map((e) => e.cause)).toEqual(expect.arrayContaining(['repair:engine_cooling:self:fail']));
  });

  it('a successful self repair clears broken only and grants success XP', () => {
    const r = repairSystem(withRoll(true), content, 'engine_cooling', 'self');
    expect(r.systems.engine_cooling).toEqual({ state: 'worn', wear: 5, broken: false });
    expect(r.voiceXp.mechanic).toBe(content.balance.voices.checkXp.success);
    expect(r.log.map((e) => e.cause)).toContain('repair:engine_cooling:self:success');
  });

  it('a service repair at a berth restores ok, wear 0 and charges 220', () => {
    const s = berth();
    const r = repairSystem(s, content, 'engine_cooling', 'service');
    expect(r.systems.engine_cooling).toEqual({ state: 'ok', wear: 0, broken: false });
    expect(r.resources.moneyEur).toBe(s.resources.moneyEur - 220);
    expect(r.rng).toBe(s.rng);
    expect(r.log.some((e) => e.kind === 'roll')).toBe(false);
  });

  it('works in the evening phase', () => {
    expect(repairSystem(berth({ phase: 'evening' }), content, 'engine_cooling', 'service').systems.engine_cooling!.broken).toBe(false);
  });

  it('throws NOT_BROKEN for a healthy system', () => {
    expect(code(() => repairSystem(makeState(), content, 'engine_cooling', 'service'))).toBe('NOT_BROKEN');
  });

  it('throws WRONG_PHASE in the morning', () => {
    expect(code(() => repairSystem(berth({ phase: 'morning' }), content, 'engine_cooling', 'service'))).toBe('WRONG_PHASE');
  });

  it('throws NOT_FOUND for unknown system or repair id', () => {
    expect(code(() => repairSystem(broken(), content, 'nope', 'self'))).toBe('NOT_FOUND');
    expect(code(() => repairSystem(broken(), content, 'engine_cooling', 'nope'))).toBe('NOT_FOUND');
  });

  it('throws REPAIR_UNAVAILABLE when requires is false', () => {
    expect(code(() => repairSystem(broken(), content, 'engine_cooling', 'service'))).toBe('REPAIR_UNAVAILABLE');
  });

  it('throws NO_MONEY when money is short, leaving the state untouched', () => {
    const s = broken();
    const poor = { ...s, resources: { ...s.resources, moneyEur: 39 } };
    expect(code(() => repairSystem(poor, content, 'engine_cooling', 'self'))).toBe('NO_MONEY');
  });
});
