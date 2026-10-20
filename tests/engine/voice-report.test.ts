import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { buildDebrief } from '../../src/engine/debrief';
import type { GameState, LogEntry } from '../../src/engine/types';
import { voiceReport } from '../../src/engine/voice-report';
import { runWeek } from '../../src/sim/run';
import { newbie } from '../../src/sim/strategies';
import { makeState } from '../fixtures/state';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;
const e = (kind: LogEntry['kind'], cause: string, extra: Partial<LogEntry> = {}): LogEntry => ({ day: 1, clockMin: 0, kind, cause, ...extra });
const roll = (cause: string, voice: string, delta: number, hit = false, extra: Partial<LogEntry> = {}): LogEntry =>
  e('roll', cause, { odds: { value: 0.1, parts: [{ source: 'base', delta: 0.1 }, { source: `voice.${voice}`, delta }] }, data: { hit }, ...extra });
const withLog = (log: LogEntry[]): GameState => makeState({ log });
const starts = (lvl = 1): LogEntry[] => ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist'].map((v) => e('decision', `voices:${v}:${lvl}`));

describe('voiceReport', () => {
  it('averages the voice part over injury and sail-break rolls in percentage points', () => {
    const r = voiceReport(withLog([...starts(), roll('roll:injury:maneuver:m:err', 'caution', -0.02), roll('roll:sail_break:r1', 'caution', -0.04)]));
    expect(r).toHaveLength(1);
    expect(r[0]!.voice).toBe('caution');
    expect(r[0]!.impacts).toEqual([{ kind: 'risk', rolls: 2, avgDeltaPp: -3 }]);
  });

  it('counts passed and failed checks by the voice part source', () => {
    const r = voiceReport(withLog([
      ...starts(),
      roll('roll:check:ev:a', 'mechanic', 0.1, true, { data: { hit: true, success: true } }),
      roll('roll:check:ev:b', 'mechanic', 0.1, true, { data: { hit: false, success: false } }),
      roll('roll:check:ev:c', 'mechanic', 0.1, true, { data: { hit: true, success: true } }),
    ]));
    expect(r[0]!.impacts).toEqual([{ kind: 'checks', passed: 2, failed: 1 }]);
  });

  it('sums economist savings, diplomat softening and sea sense fronts', () => {
    const r = voiceReport(withLog([
      ...starts(),
      e('effect', 'voice:economist:saved', { data: { eur: 8.5, for: 'marina' } }),
      e('effect', 'voice:economist:saved', { data: { eur: 10, for: 'fuel' } }),
      e('effect', 'voice:diplomat:softened', { data: { mood: 3 } }),
      e('signal', 'voice:sea_sense:front_seen', { day: 2 }),
      e('signal', 'voice:sea_sense:front_seen', { day: 4 }),
    ]));
    const by = Object.fromEntries(r.map((x) => [x.voice, x.impacts]));
    expect(by.economist).toEqual([{ kind: 'saved_eur', eur: 18.5 }]);
    expect(by.diplomat).toEqual([{ kind: 'softened', mood: 3 }]);
    expect(by.sea_sense).toEqual([{ kind: 'front_warned', days: [2, 4] }]);
  });

  it('omits voices with nothing and groups xp by cause root', () => {
    const r = voiceReport(withLog([
      ...starts(2),
      e('info', 'xp:order:order:wrong:m:err', { data: { xp: 3 } }),
      e('info', 'xp:order:order:wrong:m2:err', { data: { xp: 3 } }),
      e('info', 'xp:order:order:ok:m', { data: { xp: 1 } }),
    ]));
    expect(r.map((x) => x.voice)).toEqual(['order']);
    expect(r[0]!.xp).toEqual([{ cause: 'order:wrong', xp: 6 }, { cause: 'order:ok', xp: 1 }]);
    expect(r[0]!.startLevel).toBe(2);
    expect(r[0]!.endLevel).toBe(2);
  });

  it('lists level-ups with day and sets endLevel', () => {
    const r = voiceReport(withLog([
      ...starts(1),
      e('info', 'levelup:caution:2', { day: 3, data: { from: 1, to: 2 } }),
      e('info', 'levelup:caution:3', { day: 5, data: { from: 2, to: 3 } }),
    ]));
    expect(r[0]).toMatchObject({ voice: 'caution', startLevel: 1, endLevel: 3, levelUps: [{ day: 3, to: 2 }, { day: 5, to: 3 }] });
  });

  it('is included in buildDebrief of a full sim week', () => {
    const { state } = runWeek(content, 1, newbie);
    const d = buildDebrief(state, content);
    expect(d.voices.length).toBeGreaterThan(0);
  });
});
