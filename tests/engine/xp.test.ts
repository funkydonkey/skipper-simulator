import { describe, expect, it } from 'vitest';
import { runManeuver } from '../../src/engine/day/arrival';
import { endDay } from '../../src/engine/day/evening';
import { resolvePendingEvent } from '../../src/engine/events';
import { newGame } from '../../src/engine/setup';
import type { Content, DayFacts, GameEvent, GameState, TrainableVoice } from '../../src/engine/types';
import { applyLevelUps, grantXp, pendingLevelUps } from '../../src/engine/xp';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const base = makeContent();
const b = base.balance;
const clog = base.events[0]!;
const withEvent = (over: Partial<GameEvent> = {}): Content => ({ ...base, events: [{ ...clog, trigger: { ...clog.trigger, phase: 'morning', conditions: [] }, ...over }] });
const checkOptions = [
  { id: 'try', text: clog.options[0]!.text, check: { voice: 'mechanic' as const, difficulty: 2 }, success: {}, fail: {} },
  { id: 'skip', text: clog.options[0]!.text, effects: {} },
];
const xp = (s: GameState, v: TrainableVoice): number => s.voiceXp[v];
const withVoice = (v: TrainableVoice, level: number, voiceXp = 0): Partial<GameState> => ({
  voices: { ...makeState().voices, [v]: level }, voiceXp: { ...makeState().voiceXp, [v]: voiceXp },
});

/** Resolves the queued event with a fixed option, scanning seeds until the check gives the wanted result. */
function resolveCheck(content: Content, start: Partial<GameState>, success: boolean): GameState {
  for (let seed = 1; seed < 200; seed++) {
    const s = resolvePendingEvent(deepFreeze(makeState({ phase: 'morning', rng: seed, eventQueue: [content.events[0]!.id], ...start })), content, 'try');
    if (s.log.find((e) => e.cause.startsWith('roll:check:'))!.data!.success === success) return s;
  }
  throw new Error('no seed found');
}

describe('grantXp / applyLevelUps', () => {
  it('skips exempt voices, even for explicit effect xp', () => {
    const s = grantXp(makeState(), { economist: 5, mechanic: 2 }, 'x', b);
    expect(xp(s, 'economist')).toBe(0);
    expect(xp(s, 'mechanic')).toBe(2);
    expect(s.log.map((e) => e.cause)).toEqual(['xp:mechanic:x']);
    expect(s.log[0]).toMatchObject({ kind: 'info', data: { xp: 2 } });
  });

  it('gives no XP to a voice at max level', () => {
    const s = grantXp(makeState(withVoice('order', 4)), { order: 3 }, 'x', b);
    expect(xp(s, 'order')).toBe(0);
    expect(s.log).toEqual([]);
  });

  it('level 1 with 10 xp becomes level 2 with 2 xp and logs it', () => {
    const s = applyLevelUps(makeState(withVoice('order', 1, 10)), b);
    expect(s.voices.order).toBe(2);
    expect(xp(s, 'order')).toBe(2);
    expect(s.log).toEqual([expect.objectContaining({ kind: 'info', cause: 'levelup:order:2', data: { from: 1, to: 2 } })]);
  });

  it('raises at most one level per call', () => {
    const s = applyLevelUps(makeState(withVoice('order', 1, 40)), b);
    expect(s.voices.order).toBe(2);
    expect(xp(s, 'order')).toBe(32);
  });

  it('leaves voices below the threshold alone and zeroes xp at max level', () => {
    expect(applyLevelUps(makeState(withVoice('order', 1, 7)), b).voices.order).toBe(1);
    const capped = applyLevelUps(makeState(withVoice('order', 4, 7)), b);
    expect(xp(capped, 'order')).toBe(0);
    expect(capped.log).toEqual([]);
  });
});

describe('pendingLevelUps', () => {
  it('matches the level-ups applyLevelUps logs and does not change the state', () => {
    const state = makeState({
      voices: { ...makeState().voices, order: 1, caution: 2, mechanic: 4, diplomat: 0 },
      voiceXp: { ...makeState().voiceXp, order: 12, caution: 9, mechanic: 7, diplomat: 6 },
    });
    const frozen = deepFreeze(state);
    const pending = pendingLevelUps(frozen, b);
    const logged = applyLevelUps(state, b).log.filter((e) => e.cause.startsWith('levelup:'))
      .map((e) => ({ voice: e.cause.split(':')[1], from: e.data!.from, to: e.data!.to }));
    expect(pending).toEqual(logged);
    expect(pending.map((p) => p.voice).sort()).toEqual(['diplomat', 'order']);
  });

  it('is empty when nothing reaches a threshold', () => {
    expect(pendingLevelUps(makeState(), b)).toEqual([]);
  });
});

describe('XP sources', () => {
  const c = withEvent({ options: checkOptions });

  const d3 = withEvent({ options: [{ ...checkOptions[0]!, check: { voice: 'mechanic', difficulty: 3 } }, checkOptions[1]!] });

  it('a failed d3 check grants 3 + failBonus 2 = 5 to the checked voice with an R1 cause', () => {
    const failed = resolveCheck(d3, {}, false);
    expect(xp(failed, 'mechanic')).toBe(5);
    expect(failed.log.map((e) => e.cause)).toContain('xp:mechanic:roll:check:toilet_clog:try');
  });

  it('a successful d3 check grants difficulty × successPerDifficulty = 3', () => {
    expect(xp(resolveCheck(d3, {}, true), 'mechanic')).toBe(3);
  });

  it('a d2 check grants 2 on success and 4 on failure', () => {
    expect(xp(resolveCheck(c, {}, true), 'mechanic')).toBe(2);
    expect(xp(resolveCheck(c, {}, false), 'mechanic')).toBe(4);
  });

  it('option.xp overrides the difficulty-based check xp on success and failure', () => {
    const o = withEvent({ options: [{ ...checkOptions[0]!, check: { voice: 'mechanic', difficulty: 3 }, xp: 7 }, checkOptions[1]!] });
    expect(xp(resolveCheck(o, {}, true), 'mechanic')).toBe(7);
    expect(xp(resolveCheck(o, {}, false), 'mechanic')).toBe(7);
  });

  it('a check on an exempt voice grants nothing', () => {
    const o = withEvent({ options: [{ ...checkOptions[0]!, check: { voice: 'pride', difficulty: 2 } }, checkOptions[1]!] });
    expect(resolveCheck(o, {}, false).voiceXp).toEqual(makeState().voiceXp);
  });

  it('explicit effect.xp is granted with the outcome cause', () => {
    const o = withEvent({ options: [{ id: 'try', text: clog.options[0]!.text, effects: { xp: { diplomat: 2, economist: 4 } } }, checkOptions[1]!] });
    const s = resolvePendingEvent(makeState({ phase: 'morning', eventQueue: ['toilet_clog'] }), o, 'try');
    expect(xp(s, 'diplomat')).toBe(2);
    expect(xp(s, 'economist')).toBe(0);
    expect(s.log.map((e) => e.cause)).toContain('xp:diplomat:event:toilet_clog:try');
  });

  const wrongOrder = ['release_lines', 'neutral', 'command_helm', 'engage_gear'];
  const correct = ['neutral', 'command_helm', 'release_lines', 'engage_gear'];

  it('a maneuver with two errors grants order +6', () => {
    const s = runManeuver(makeState(), base, 'departure', { departure: wrongOrder });
    expect(s.log.filter((e) => e.cause.startsWith('xp:order:order:wrong:')).map((e) => e.cause)).toEqual([
      'xp:order:order:wrong:dep_test:release_before_neutral',
      'xp:order:order:wrong:dep_test:release_before_command',
    ]);
    expect(xp(s, 'order')).toBe(6);
  });

  it('error.xp overrides the default error xp', () => {
    const m = { ...base.maneuvers[0]!, errors: base.maneuvers[0]!.errors.map((e) => ({ ...e, xp: 1 })) };
    const s = runManeuver(makeState(), { ...base, maneuvers: [m, ...base.maneuvers.slice(1)] }, 'departure', { departure: wrongOrder });
    expect(xp(s, 'order')).toBe(2);
  });

  it('clean maneuvers grant order cleanManeuverXp (2) once per day', () => {
    let s = runManeuver(makeState(), base, 'departure', { departure: correct });
    s = runManeuver(s, base, 'mooring');
    expect(xp(s, 'order')).toBe(2);
    expect(s.log.filter((e) => e.cause.startsWith('xp:order:order:ok:')).map((e) => e.cause)).toEqual(['xp:order:order:ok:dep_test']);
    expect(xp(runManeuver({ ...s, day: 2 }, base, 'mooring'), 'order')).toBe(4);
  });
});

describe('level changes land in the evening', () => {
  const facts: DayFacts = { day: 1, departureHour: 9, arrivalHour: 14, arrivalPointKind: 'marina', mooring: 'berth', activities: [], motorHours: 2, sailHours: 0, autopilotHours: 0, maxWindKn: 0, shower: 'normal' };

  it('a failed check does not change the level for the next check the same day; endDay does', () => {
    const c = withEvent({ options: checkOptions });
    const start = withVoice('mechanic', 1, 8);
    let s = resolveCheck(c, { ...start, eventQueue: ['toilet_clog', 'toilet_clog'] }, false);
    expect(s.voices.mechanic).toBe(1);
    expect(xp(s, 'mechanic')).toBe(12);
    const odds = (st: GameState) => st.log.filter((e) => e.cause.startsWith('roll:check:')).map((e) => e.odds!.value);
    s = resolvePendingEvent(s, c, 'try');
    const [first, second] = odds(s);
    expect(second).toBe(first);
    const done = endDay({ ...s, phase: 'evening', locationId: 'marina_b', dayFacts: facts }, base, { dinner: 'cook' });
    expect(done.voices.mechanic).toBe(2);
    expect(done.log.map((e) => e.cause)).toContain('levelup:mechanic:2');
    expect(done.log.findIndex((e) => e.cause === 'levelup:mechanic:2')).toBeLessThan(done.log.findIndex((e) => e.cause === 'night:sleep'));
  });
});

describe('newGame', () => {
  it('is version 4 with zeroed voiceXp', () => {
    const g = newGame(base, { seed: 1, lang: 'en' });
    expect(g.version).toBe(4);
    expect(g.voiceXp).toEqual({ sea_sense: 0, caution: 0, order: 0, mechanic: 0, diplomat: 0, economist: 0 });
  });
});
