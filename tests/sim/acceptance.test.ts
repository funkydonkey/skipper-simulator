import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { parseContent } from '../../src/content/parse';
import { toRaw } from '../fixtures/raw';
import { endDay, eventText, finishWeek, planDay, presentEvent, startDay } from '../../src/engine';
import { buildConditionContext } from '../../src/engine/expr';
import { PILLARS, type GameEvent, type GameState } from '../../src/engine/types';
import { drainEvents, pillarsAffected, playDay, runWeek, setupWeek, weekScore } from '../../src/sim/run';
import { runBatch } from '../../src/sim/batch';
import { expert, makeStrategy, newbie } from '../../src/sim/strategies';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const newbieRuns = SEEDS.map((seed) => runWeek(content, seed, newbie));
const expertRuns = SEEDS.map((seed) => runWeek(content, seed, expert));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('ТЗ 7.4 acceptance', () => {
  it('#1 the week runs from boat choice to debrief with no dead ends', () => {
    for (const r of [...newbieRuns, ...expertRuns]) {
      expect(r.state.phase).toBe('debrief');
      expect(r.state.day).toBe(content.balance.schedule.days + 1);
      expect(r.state.eventQueue).toEqual([]);
    }
  });

  it('#2 every pillar influences a typical game', () => {
    const counts = newbieRuns.map((r) => pillarsAffected(r.state).size).sort((a, b) => a - b);
    expect(counts[Math.floor(counts.length / 2)]).toBeGreaterThanOrEqual(5);
    const union = new Set(newbieRuns.flatMap((r) => [...pillarsAffected(r.state)]));
    expect([...union].sort()).toEqual([...PILLARS].sort());
  });

  it('#3 the newbie strategy clearly loses to the right one', () => {
    expect(mean(expertRuns.map((r) => weekScore(r.debrief)))).toBeGreaterThanOrEqual(mean(newbieRuns.map((r) => weekScore(r.debrief))) + 2);
    expect(mean(newbieRuns.map((r) => r.debrief.depositLossEur))).toBeGreaterThan(mean(expertRuns.map((r) => r.debrief.depositLossEur)));
    expect(mean(newbieRuns.map((r) => r.state.resources.mood))).toBeLessThan(mean(expertRuns.map((r) => r.state.resources.mood)));
  });

  it('#4 the debrief shows at least 3 decision → consequence links', () => {
    const withThree = newbieRuns.filter((r) => r.debrief.links.length >= 3).length;
    expect(withThree / newbieRuns.length).toBeGreaterThanOrEqual(0.8);
    for (const r of [...newbieRuns, ...expertRuns]) {
      const consequences = r.debrief.links.map((l) => l.consequence);
      expect(new Set(consequences).size).toBe(consequences.length);
      for (const l of r.debrief.links) {
        if (['injury_loaded_lines', 'injury_cleats'].includes(l.ruleId) && l.consequence.cause.startsWith('injury')) {
          expect(l.consequence.cause).toMatch(/^injury:event:/);
        }
      }
    }
  });

  it('every event fires in some simulated week, except an explained allow-list', () => {
    const NEVER_FIRES_IN_SIM = [
      'fuel_dock_queue', // needs fuel_pct < 40 at a marina: both strategies refill at every berth and never burn 60% of a tank in one day
    ];
    const fired = new Set([...newbieRuns, ...expertRuns].flatMap((r) => r.state.firedEvents));
    const never = content.events.map((e) => e.id).filter((id) => !fired.has(id)).sort();
    expect(never).toEqual(NEVER_FIRES_IN_SIM);
    expect(fired).toContain('strait_chop');
  });

  it('#5 texts come out in both languages', () => {
    const s = setupWeek(content, 1, expert, 'en');
    const ev = content.events[0]!;
    expect(presentEvent(ev, s, buildConditionContext(s, content), content).text).toBe(eventText(ev, s).en);
  });

  it('#6 a new event works by editing JSON only', () => {
    const extra: GameEvent = {
      id: 'json_only_test', pillar: 'time', trigger: { phase: 'morning', conditions: ['day == 1'], chance: 1 }, scene: 'cockpit_morning',
      text: { ru: 'Тестовое событие.', en: 'A test event.' },
      voices: [{ voice: 'caution', min_level: 0, text: { ru: 'Проверка.', en: 'Check.' } }],
      options: [
        { id: 'a', text: { ru: 'А', en: 'A' }, effects: { mood: 1 } },
        { id: 'b', text: { ru: 'Б', en: 'B' }, effects: { mood: -1 } },
      ],
      debrief: { ru: 'Тест.', en: 'Test.' },
    };
    const raw = { ...toRaw(content), events: [extra, ...content.events] };
    const parsed = parseContent(raw);
    expect(parsed.errors).toEqual([]);
    expect(runWeek(parsed.content!, 1, newbie).state.firedEvents).toContain('json_only_test');
  });

  it('#7 the same seed gives the same week; different seeds differ', () => {
    expect(runWeek(content, 42, newbie)).toEqual(runWeek(content, 42, newbie));
    expect(runWeek(content, 42, newbie).state.log).not.toEqual(runWeek(content, 43, newbie).state.log);
  });

  it('save/load mid-week continues identically (Review Focus #4)', () => {
    let s = setupWeek(content, 7, newbie);
    for (let i = 0; i < 3; i++) s = playDay(s, content, newbie);
    let restored = JSON.parse(JSON.stringify(s));
    while (s.phase === 'morning') s = playDay(s, content, newbie);
    while (restored.phase === 'morning') restored = playDay(restored, content, newbie);
    expect(finishWeek(restored, content)).toEqual(finishWeek(s, content));
  });

  it('save/load in the planning phase with an event queued continues identically', () => {
    const finish = (from: GameState): GameState => {
      let s = drainEvents(from, content, newbie);
      s = drainEvents(planDay(s, content, newbie.plan(s, content)), content, newbie);
      s = endDay(s, content, newbie.evening(s, content));
      while (s.phase === 'morning') s = playDay(s, content, newbie);
      return finishWeek(s, content);
    };
    const saved = SEEDS.map((seed) => {
      let s = setupWeek(content, seed, newbie);
      while (s.phase === 'morning') {
        const planning = startDay(s, content, newbie.morning(s, content));
        if (planning.eventQueue.length > 0) return planning;
        s = playDay(s, content, newbie);
      }
      return null;
    }).find((s): s is GameState => s !== null);
    expect(saved).toBeDefined();
    expect(saved!.phase).toBe('planning');
    const restored: GameState = JSON.parse(JSON.stringify(saved));
    expect(finish(restored)).toEqual(finish(saved!));
  });

  describe('data-driven balance targets (balance.simTargets, 100 seeds)', () => {
    const BATCH_SEEDS = Array.from({ length: 100 }, (_, i) => i + 1);
    const targets = content.balance.simTargets;
    const stats = { newbie: runBatch(content, newbie, BATCH_SEEDS), expert: runBatch(content, expert, BATCH_SEEDS) };
    const boats = content.boats.map((boat) => boat.id);
    const careful = Object.fromEntries(boats.map((id) => [id, runBatch(content, makeStrategy('careful', id), BATCH_SEEDS)]));
    const ignoring = Object.fromEntries(boats.map((id) => [id, runBatch(content, makeStrategy('ignore-weakness', id), BATCH_SEEDS)]));
    const inBand = (value: number, [lo, hi]: readonly [number, number]) => {
      expect(value).toBeGreaterThanOrEqual(lo);
      expect(value).toBeLessThanOrEqual(hi);
    };

    for (const name of ['newbie', 'expert'] as const) {
      it(`${name} level gain stays within its target band`, () => inBand(stats[name].levelGainMean, targets.levelGain[name]));
      it(`${name} week injury rate stays within its target band`, () => inBand(stats[name].weekInjuryRate, targets.weekInjuryRate[name]));
    }

    for (const boat of boats) {
      it(`ignore-weakness on ${boat} hits the boat's weakness in at least weaknessMinRate of weeks`, () => {
        expect(ignoring[boat]!.weaknessRate).toBeGreaterThanOrEqual(targets.weaknessMinRate);
      });
      it(`careful on ${boat} keeps the mean score and the injury rate within the careful targets`, () => {
        expect(careful[boat]!.meanScore).toBeGreaterThanOrEqual(targets.careful.minMeanScore);
        inBand(careful[boat]!.weekInjuryRate, targets.careful.weekInjuryRate);
      });
      it(`careful on ${boat} level gain stays within its target band`, () => inBand(careful[boat]!.levelGainMean, targets.levelGain.careful));
      it(`careful on ${boat} meets the variety targets (R8)`, () => {
        const v = careful[boat]!.variety;
        expect(v.mooringStepSets).toBeGreaterThanOrEqual(targets.variety.minMooringStepSets);
        expect(v.meanWeeklyMooringSets).toBeGreaterThanOrEqual(targets.variety.minMeanWeeklyMooringSets);
        expect(v.templatesSeen).toBeGreaterThanOrEqual(targets.variety.minTemplatesSeen);
      });
    }

    it('events that fire in no simulated strategy are exactly zeroFireAllow', () => {
      const all = [stats.newbie, stats.expert, ...Object.values(careful), ...Object.values(ignoring)];
      const never = content.events.map((e) => e.id).filter((id) => all.every((st) => st.zeroFire.includes(id))).sort();
      expect(never).toEqual([...targets.zeroFireAllow].sort());
    });
  });
});
