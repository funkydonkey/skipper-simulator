import { describe, expect, it } from 'vitest';
import { arrive } from '../../src/engine/day/arrival';
import { startDay } from '../../src/engine/day/morning';
import { presentEvent } from '../../src/engine/events';
import { buildConditionContext } from '../../src/engine/expr';
import { forecastInsight, priceFor, voicePerks } from '../../src/engine/perks';
import { resolveDueExpectations, createExpectation, expectationMoodDelta } from '../../src/engine/promises';
import { refillAt } from '../../src/engine/resources';
import { requireBoat } from '../../src/engine/state';
import type { DayFacts, GameState, VoiceId } from '../../src/engine/types';
import { audibleLines } from '../../src/engine/voices';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const content = makeContent();
const b = content.balance;
const withVoice = (v: VoiceId, level: number): Record<VoiceId, number> => ({ ...makeState().voices, [v]: level });
const frontDay = (voice: number): GameState => makeState({
  day: 3, voices: withVoice('sea_sense', voice),
  weather: { ...makeState().weather!, day: 3, front: true },
});

describe('economist', () => {
  it('priceFor takes 5% per level, rounded to 0.1', () => {
    expect(priceFor(85, 2, b)).toEqual({ eur: 76.5, savedEur: 8.5 });
    expect(priceFor(85, 0, b)).toEqual({ eur: 85, savedEur: 0 });
  });

  it('a marina night at economist 2 charges 76.5 and logs the saving', () => {
    const priced = { ...content, map: content.map.map((p) => (p.id === 'marina_b' ? { ...p, priceEur: 85 } : p)) };
    const s = makeState({ locationId: 'marina_b', clockMin: 10 * 60 });
    const r = arrive(s, priced, requireBoat(priced, s)).state;
    expect(r.log.find((e) => e.cause === 'marina:fee')!.delta!.moneyEur).toBe(-76.5);
    expect(r.log).toContainEqual(expect.objectContaining({ kind: 'info', cause: 'voice:economist:saved', data: { eur: 8.5, for: 'marina:fee' } }));
  });

  it('fuel and gas refills are discounted too', () => {
    const s = makeState({ resources: { ...makeState().resources, fuelL: 50, gasPct: 10 } });
    const point = content.map.find((p) => p.id === 'marina_b')!;
    const out = refillAt(s, requireBoat(content, s), point, b);
    expect(out.find((o) => o.cause === 'refill:gas')!.effect.money).toBe(-27);
    expect(out.find((o) => o.cause === 'refill:fuel')!.saved).toBeGreaterThan(0);
  });
});

describe('sea sense', () => {
  it('forecastInsight reveals chance at 3 and hour at 4, only on a front day', () => {
    expect(forecastInsight(frontDay(2), content)).toEqual({ frontChance: null, frontFromHour: null });
    expect(forecastInsight(frontDay(3), content)).toEqual({ frontChance: 0.5, frontFromHour: null });
    expect(forecastInsight(frontDay(4), content)).toEqual({ frontChance: 0.5, frontFromHour: b.weather.afternoonFromHour });
    expect(forecastInsight({ ...frontDay(4), weather: { ...frontDay(4).weather!, front: false } }, content).frontFromHour).toBeNull();
  });

  it('logs front_seen whenever the voice is keen enough to read the front, barometer or not', () => {
    const morning = (open: boolean, sense: number) => {
      for (let seed = 1; seed < 200; seed++) {
        const s = startDay(makeState({ phase: 'morning', day: 3, rng: seed, eventQueue: [], voices: withVoice('sea_sense', sense) }), content, { openBarometer: open });
        if (s.weather?.front) return s;
      }
      throw new Error('no front seed');
    };
    const seen = (s: GameState) => s.log.some((e) => e.cause === 'voice:sea_sense:front_seen');
    const keen = b.voices.seaSenseSignalLevel;
    expect(seen(morning(false, keen))).toBe(true);
    expect(seen(morning(true, keen))).toBe(true);
    expect(seen(morning(true, keen - 1))).toBe(false);
  });

  it('logs barometer:open for the locked box a keen sense sends', () => {
    const s = startDay(makeState({ phase: 'morning', day: 3, eventQueue: [], voices: withVoice('sea_sense', b.voices.seaSenseSignalLevel) }), content, { openBarometer: true });
    expect(s.log.map((e) => e.cause)).toContain('barometer:open');
  });
});

describe('voicePerks', () => {
  const ids = (v: Parameters<typeof voicePerks>[0], l: number) => voicePerks(v, l, b).map((p) => p.id);
  it('mechanic: exact gauges from level 2', () => {
    expect(ids('mechanic', 2)).toContain('exact_gauges');
    expect(ids('mechanic', 1)).not.toContain('exact_gauges');
  });
  it('caution: risk, time and check values', () => {
    expect(voicePerks('caution', 2, b)).toEqual([
      { id: 'risk_injury', value: -0.16 }, { id: 'maneuver_time', value: 0.1 }, { id: 'check_bonus', value: 0.3 },
    ]);
  });
  it('order, diplomat, economist, sea sense', () => {
    expect(voicePerks('order', 3, b)).toContainEqual({ id: 'risk_injury', value: -0.3 });
    expect(voicePerks('diplomat', 2, b)).toContainEqual({ id: 'promise_softening', value: -0.2 });
    expect(voicePerks('economist', 2, b)).toEqual([{ id: 'discount', value: -0.1 }]);
    expect(ids('sea_sense', 2)).toEqual(['local_wind', 'front_signals', 'check_bonus']);
    expect(ids('sea_sense', 4)).toEqual(['local_wind', 'front_signals', 'front_chance', 'front_timing', 'check_bonus']);
  });
  it('level 0 grants nothing', () => {
    for (const v of ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist'] as const) expect(voicePerks(v, 0, b)).toEqual([]);
  });
});

describe('diplomat', () => {
  const facts: DayFacts = {
    day: 1, departureHour: 10, arrivalHour: 14, arrivalPointKind: 'bay', mooring: 'anchor', activities: [],
    motorHours: 2, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal',
  };
  it('broken promise reports the softened mood: 20% of the base penalty at level 2', () => {
    const e = createExpectation(content.dialogues.find((d) => d.id === 'early_try')!, 'briefing', 0)!;
    const base = -expectationMoodDelta(e.strength, 'broken', 0, 1, b);
    const r = resolveDueExpectations([e], facts, 2, 1, b);
    expect(r.softened).toEqual([{ mood: Math.round(base * 0.2 * 10) / 10 }]);
    expect(resolveDueExpectations([e], facts, 0, 1, b).softened).toEqual([]);
  });
});

describe('conditional voice lines', () => {
  const line = { voice: 'crew_voice' as const, min_level: 1, text: { ru: 'а', en: 'a' }, when: 'mood < 50' };
  it('is audible only while the condition holds', () => {
    const lines = (mood: number) => {
      const s = makeState({ resources: { ...makeState().resources, mood } });
      return audibleLines([line], s.voices, buildConditionContext(s, content));
    };
    expect(lines(40)).toHaveLength(1);
    expect(lines(60)).toHaveLength(0);
  });
  it('presentEvent passes its context', () => {
    const ev = { ...content.events[0]!, voices: [line] };
    const s = makeState({ resources: { ...makeState().resources, mood: 40 } });
    expect(presentEvent(ev, s, buildConditionContext(s, content), content).voices).toHaveLength(1);
  });
});
