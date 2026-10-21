import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { evaluateChance, maneuverRisk, presentEvent, resolvePendingEvent } from '../../src/engine';
import { buildConditionContext, type CondContext } from '../../src/engine/expr';
import { anchorFailSpec, checkSpec, eventTriggerSpec, injurySpec, marinaRefusalSpec, sailBreakSpec } from '../../src/engine/odds';
import { newGame } from '../../src/engine/setup';
import { clamp } from '../../src/engine/state';
import type { Balance, GameEvent, Seabed, VoiceId } from '../../src/engine/types';
import { runWeek } from '../../src/sim/run';
import { expert, newbie } from '../../src/sim/strategies';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const fixture = makeContent();
const b = fixture.balance;
const PRECISION = 12;

// ---- Reference formulas: copied from the engine before chance specs (Stage 2). ----
const oldCheckChance = (level: number, difficulty: number, fatigue: number, bal: Balance): number =>
  clamp(bal.checks.base + (level - difficulty) * bal.checks.perLevel - fatigue * bal.fatigue.checkPenaltyPerPoint, bal.checks.min, bal.checks.max);
const oldRiskFactor = (caution: number, order: number, bal: Balance): number =>
  Math.max(0, (1 - caution * bal.voices.cautionRiskPerLevel) * (1 - order * bal.voices.orderRiskPerLevel));
const oldInjury = (chance: number, caution: number, order: number, mitigated: boolean, bal: Balance): number =>
  chance * oldRiskFactor(caution, order, bal) * (mitigated ? bal.safety.mitigationFactor : 1);
const oldAnchorFail = (seabed: Seabed, windKn: number, briefed: boolean, night: boolean, bal: Balance): number => {
  const [lo, hi] = bal.time.anchorFailChance;
  const base = lo + (hi - lo) * bal.time.seabedFailFactor[seabed];
  const wind = windKn >= bal.time.anchorWindPenaltyKn ? bal.time.anchorWindPenalty : 0;
  const brief = briefed ? bal.time.anchorBriefedReduction : 0;
  const dark = night ? bal.time.nightAnchorPenalty : 0;
  return clamp(base + wind + dark - brief, 0, 0.95);
};
const oldTrigger = (chance: number, weight: number): number => Math.min(1, chance * weight);

const LEVELS = [0, 1, 2, 3, 4];
const SEABEDS: Seabed[] = ['sand', 'mud', 'weed', 'rock'];
const voiceCtx = (caution: number, order: number, extra: CondContext = {}): CondContext =>
  ({ 'voice.caution': caution, 'voice.order': order, ...extra });

describe('odds builders reproduce the Stage 2 formulas', () => {
  it('checkSpec: level, difficulty, fatigue, clamp', () => {
    for (const voice of ['mechanic', 'diplomat'] as VoiceId[]) {
      for (const level of LEVELS) {
        for (const difficulty of [0, 1, 2, 3, 4, 6]) {
          for (const fatigue of [0, 10, 37, 50, 100]) {
            const ctx = { [`voice.${voice}`]: level, fatigue };
            const got = evaluateChance(checkSpec({ voice, difficulty }, b), ctx).value;
            expect(got).toBeCloseTo(oldCheckChance(level, difficulty, fatigue, b), PRECISION);
          }
        }
      }
    }
  });

  it('checkSpec breaks the chance down by source', () => {
    const odds = evaluateChance(checkSpec({ voice: 'mechanic', difficulty: 2 }, b), { 'voice.mechanic': 3, fatigue: 25 });
    expect(odds.parts.map((p) => p.source)).toEqual(['base', 'difficulty', 'voice.mechanic', 'fatigue']);
    expect(odds.parts.reduce((s, p) => s + p.delta, 0)).toBeCloseTo(odds.value, PRECISION);
  });

  it('injurySpec: caution, order, mitigation', () => {
    for (const chance of [0, 0.1, 0.15, 0.25, 1]) {
      for (const caution of LEVELS) {
        for (const order of LEVELS) {
          for (const mitigated of [false, true]) {
            const ctx = voiceCtx(caution, order, { 'briefing.loaded_lines': mitigated });
            const got = evaluateChance(injurySpec(chance, 'briefing.loaded_lines', b), ctx).value;
            expect(got).toBeCloseTo(oldInjury(chance, caution, order, mitigated, b), PRECISION);
          }
        }
      }
    }
  });

  it('injurySpec without a mitigation flag ignores briefings', () => {
    const ctx = voiceCtx(1, 1, { 'briefing.loaded_lines': true });
    expect(evaluateChance(injurySpec(0.2, undefined, b), ctx).value).toBeCloseTo(oldInjury(0.2, 1, 1, false, b), PRECISION);
  });

  it('sailBreakSpec: caution and order', () => {
    for (const chance of [0, 0.03, 0.12, 0.6]) {
      for (const caution of LEVELS) {
        for (const order of LEVELS) {
          const got = evaluateChance(sailBreakSpec(chance, b), voiceCtx(caution, order)).value;
          expect(got).toBeCloseTo(oldInjury(chance, caution, order, false, b), PRECISION);
        }
      }
    }
  });

  it('anchorFailSpec: seabed, wind, night, briefing, max 0.95', () => {
    for (const seabed of SEABEDS) {
      for (const windKn of [0, 10, 17.9, 18, 30]) {
        for (const night of [false, true]) {
          for (const briefed of [false, true]) {
            const ctx = { 'place.seabed': seabed, wind: windKn, night, 'briefing.anchor': briefed };
            const got = evaluateChance(anchorFailSpec(b), ctx).value;
            expect(got).toBeCloseTo(oldAnchorFail(seabed, windKn, briefed, night, b), PRECISION);
          }
        }
      }
    }
    const worst = { ...b, time: { ...b.time, nightAnchorPenalty: 0.5 } };
    expect(evaluateChance(anchorFailSpec(worst), { 'place.seabed': 'rock', wind: 30, night: true }).value).toBe(0.95);
  });

  it('anchorFailSpec labels each source', () => {
    const odds = evaluateChance(anchorFailSpec(b), { 'place.seabed': 'rock', wind: 30, night: true, 'briefing.anchor': true });
    expect(odds.parts.map((p) => p.source)).toEqual(['base', 'seabed', 'wind', 'night', 'briefing']);
  });

  it('marinaRefusalSpec: only when late', () => {
    expect(evaluateChance(marinaRefusalSpec(b), { 'marina.late': false }).value).toBe(0);
    expect(evaluateChance(marinaRefusalSpec(b), { 'marina.late': true }).value).toBe(b.time.marinaLateRefusalChance);
  });

  it('eventTriggerSpec: chance × drama weight, capped at 1', () => {
    const clog = fixture.events[0]!;
    for (const chance of [0, 0.25, 0.5, 0.7, 1]) {
      for (const pillar of ['weather', 'boat', 'safety', 'time'] as const) {
        for (const day of [1, 2, 3, 4, 5, 6, 7]) {
          const e: GameEvent = { ...clog, pillar, trigger: { ...clog.trigger, chance } };
          const weight = b.drama.pillarWeightByDay[String(day)]?.[pillar] ?? 1;
          expect(evaluateChance(eventTriggerSpec(e, day, b), {}).value).toBeCloseTo(oldTrigger(chance, weight), PRECISION);
        }
      }
    }
  });

  it('eventTriggerSpec: drama part only when the weight is not 1; spec triggers keep their mods', () => {
    const clog = fixture.events[0]!;
    const plain = { ...clog, pillar: 'boat' as const, trigger: { ...clog.trigger, chance: 0.4 } };
    expect(eventTriggerSpec(plain, 3, b).mods ?? []).toEqual([]);
    expect(eventTriggerSpec(plain, 2, b).mods).toEqual([{ mul: 0.5, label: 'drama' }]);
    const spec = { ...plain, trigger: { ...plain.trigger, chance: { base: 0.2, mods: [{ if: 'front', add: 0.2, label: 'wind' as const }] } } };
    expect(evaluateChance(eventTriggerSpec(spec, 2, b), { front: true }).value).toBeCloseTo(0.6, PRECISION);
    expect(evaluateChance(eventTriggerSpec(spec, 2, b), { front: false }).value).toBeCloseTo(0.3, PRECISION);
  });
});

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;

describe('maneuverRisk', () => {
  const voices = { sea_sense: 4, caution: 2, order: 1, mechanic: 4, diplomat: 1, economist: 0, pride: 2, crew_voice: 2 };
  const state = { ...newGame(content, { seed: 1, lang: 'en' }), voices };
  const mooring = content.maneuvers.find((m) => m.id === 'mooring_med')!;
  const maxInjury = Math.max(...mooring.errors.map((e) => e.injuryChance));

  it('mooring_med with caution 2, order 1, no briefing = maxInjury × 0.84 × 0.9', () => {
    expect(maneuverRisk(state, content, 'mooring')!.value).toBeCloseTo(maxInjury * 0.84 * 0.9, PRECISION);
  });

  it('applies the mitigation flag of that error', () => {
    const worst = mooring.errors.reduce((a, e) => (e.injuryChance > a.injuryChance ? e : a));
    const briefed = { ...state, flags: { [worst.mitigatedBy!]: true } };
    expect(maneuverRisk(briefed, content, 'mooring')!.value).toBeCloseTo(maxInjury * 0.84 * 0.9 * b.safety.mitigationFactor, PRECISION);
  });

  it('null when the maneuver has no injurable error or is missing', () => {
    const safe = { ...content, maneuvers: content.maneuvers.map((m) => ({ ...m, errors: m.errors.map((e) => ({ ...e, injuryChance: 0 })) })) };
    expect(maneuverRisk(state, safe, 'mooring')).toBeNull();
    expect(maneuverRisk(state, { ...content, maneuvers: [] }, 'mooring')).toBeNull();
  });
});

describe('event check odds', () => {
  it('presentEvent shows the same odds that resolvePendingEvent logs (Review Focus 1)', () => {
    const clog = fixture.events[0]!;
    const state = makeState({ day: 3, phase: 'evening', eventQueue: [clog.id], resources: { ...makeState().resources, fatigue: 37 } });
    const view = presentEvent(clog, state, buildConditionContext(state, fixture), b);
    const i = clog.options.findIndex((o) => o.check);
    const done = resolvePendingEvent(state, fixture, clog.options[i]!.id);
    const roll = done.log.find((e) => e.kind === 'roll')!;
    expect(roll.cause).toBe(`roll:check:${clog.id}:${clog.options[i]!.id}`);
    expect(roll.odds!.value).toBe(view.options[i]!.chance!.value);
    expect(roll.data).toMatchObject({ hit: roll.data!.success, chance: roll.odds!.value });
  });
});

describe('roll logging', () => {
  const ROLL_CAUSE = /^roll:(check:\w+:\w+|injury:maneuver:\w+:\w+|sail_break:\w+|injury:reef:\w+|anchor:[1-9]|marina:\w+|front:\d+|failure:\w+:\w+)$/;
  const weeks = [1, 2, 3, 4, 5].flatMap((seed) => [runWeek(content, seed, newbie).state, runWeek(content, seed, expert).state]);

  it('every roll entry has a known cause, odds that sum to its value, and a hit flag', () => {
    const rolls = weeks.flatMap((s) => s.log.filter((e) => e.kind === 'roll'));
    expect(rolls.length).toBeGreaterThan(0);
    for (const e of rolls) {
      expect(e.cause).toMatch(ROLL_CAUSE);
      expect(typeof e.data?.hit).toBe('boolean');
      expect(e.odds!.value).toBeGreaterThanOrEqual(0);
      expect(e.odds!.value).toBeLessThanOrEqual(1);
      expect(e.odds!.parts.reduce((sum, p) => sum + p.delta, 0)).toBeCloseTo(e.odds!.value, PRECISION);
    }
  });

  it('logs one front roll per sailing day and never logs event triggers', () => {
    for (const s of weeks) {
      const fronts = s.log.filter((e) => e.cause.startsWith('roll:front:')).map((e) => e.cause);
      expect(fronts).toEqual(Array.from({ length: content.balance.schedule.days }, (_, i) => `roll:front:${i + 1}`));
      expect(s.log.some((e) => e.cause.startsWith('roll:event'))).toBe(false);
    }
  });

  it('a failed anchor attempt is logged as a hit, the holding one as a miss', () => {
    const maxAttempts = content.balance.time.anchorMaxAttempts;
    let checked = 0;
    for (const s of weeks) {
      s.log.forEach((e, i) => {
        if (!e.cause.startsWith('anchor:attempts:')) return;
        const n = Number(e.cause.split(':')[2]);
        const rolls = s.log.slice(i - n, i);
        expect(rolls.map((r) => r.cause)).toEqual(Array.from({ length: n }, (_, k) => `roll:anchor:${k + 1}`));
        expect(rolls.slice(0, -1).every((r) => r.data?.hit === true)).toBe(true);
        if (n < maxAttempts) expect(rolls.at(-1)!.data?.hit).toBe(false);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });
});
