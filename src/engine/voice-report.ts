import { causeMatches } from './log';
import { TRAINABLE_VOICES, type GameState, type LogEntry, type TrainableVoice } from './types';

export type VoiceImpact =
  | { kind: 'risk'; rolls: number; avgDeltaPp: number }
  | { kind: 'checks'; passed: number; failed: number }
  | { kind: 'saved_eur'; eur: number }
  | { kind: 'front_warned'; days: number[] }
  | { kind: 'softened'; mood: number };

export interface VoiceReport {
  voice: TrainableVoice;
  startLevel: number;
  endLevel: number;
  xp: Array<{ cause: string; xp: number }>;
  levelUps: Array<{ day: number; to: number }>;
  impacts: VoiceImpact[];
}

const round1 = (n: number): number => Math.round(n * 10) / 10;
const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** The voice's own part in a roll's odds, or undefined when it did not take part. */
function voiceDelta(e: LogEntry, voice: TrainableVoice): number | undefined {
  return e.odds?.parts.find((p) => p.source === `voice.${voice}`)?.delta;
}

function xpByRoot(log: readonly LogEntry[], voice: TrainableVoice): VoiceReport['xp'] {
  const prefix = `xp:${voice}:`;
  const totals = new Map<string, number>();
  for (const e of log) {
    if (!e.cause.startsWith(prefix)) continue;
    const rootCause = e.cause.slice(prefix.length).split(':').slice(0, 2).join(':');
    totals.set(rootCause, (totals.get(rootCause) ?? 0) + num(e.data?.xp));
  }
  return [...totals].map(([cause, xp]) => ({ cause, xp }));
}

function impactsOf(log: readonly LogEntry[], voice: TrainableVoice): VoiceImpact[] {
  const impacts: VoiceImpact[] = [];
  const risk = log
    .filter((e) => e.kind === 'roll' && (causeMatches(e.cause, 'roll:injury') || causeMatches(e.cause, 'roll:sail_break')))
    .map((e) => voiceDelta(e, voice))
    .filter((d): d is number => d !== undefined);
  if (risk.length > 0) impacts.push({ kind: 'risk', rolls: risk.length, avgDeltaPp: round1((sum(risk) / risk.length) * 100) });

  const checks = log.filter((e) => e.kind === 'roll' && causeMatches(e.cause, 'roll:check') && voiceDelta(e, voice) !== undefined);
  if (checks.length > 0) {
    const passed = checks.filter((e) => e.data?.success === true).length;
    impacts.push({ kind: 'checks', passed, failed: checks.length - passed });
  }

  const saved = log.filter((e) => causeMatches(e.cause, `voice:${voice}:saved`));
  if (saved.length > 0) impacts.push({ kind: 'saved_eur', eur: round1(sum(saved.map((e) => num(e.data?.eur)))) });

  const fronts = log.filter((e) => causeMatches(e.cause, `voice:${voice}:front_seen`));
  if (fronts.length > 0) impacts.push({ kind: 'front_warned', days: fronts.map((e) => e.day) });

  const softened = log.filter((e) => causeMatches(e.cause, `voice:${voice}:softened`));
  if (softened.length > 0) impacts.push({ kind: 'softened', mood: sum(softened.map((e) => num(e.data?.mood))) });
  return impacts;
}

/** What each trainable voice did this week, derived from the log. Idle voices are omitted. */
export function voiceReport(state: GameState): VoiceReport[] {
  const log = state.log;
  return TRAINABLE_VOICES.flatMap((voice): VoiceReport[] => {
    const start = log.find((e) => e.kind === 'decision' && e.cause.startsWith(`voices:${voice}:`));
    const startLevel = start ? Number(start.cause.split(':')[2]) : 0;
    const levelUps = log
      .filter((e) => e.kind === 'info' && e.cause.startsWith(`levelup:${voice}:`))
      .map((e) => ({ day: e.day, to: Number(e.cause.split(':')[2]) }));
    const xp = xpByRoot(log, voice);
    const impacts = impactsOf(log, voice);
    if (xp.length === 0 && levelUps.length === 0 && impacts.length === 0) return [];
    const endLevel = levelUps.length > 0 ? levelUps[levelUps.length - 1]!.to : startLevel;
    return [{ voice, startLevel, endLevel, xp, levelUps, impacts }];
  });
}
