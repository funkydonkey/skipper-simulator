import { TRAINABLE_VOICES, type Content, type Dir8, type GameState } from '../engine/types';
import { runWeek, weekScore } from './run';
import type { Strategy } from './strategies';
import { weaknessHit } from './weakness';

const RESOURCES = ['water', 'service', 'fuel', 'gas'] as const;
type Resource = (typeof RESOURCES)[number];

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: readonly number[]) => (xs.length === 0 ? 0 : sum(xs) / xs.length);

export interface BatchStats {
  weeks: number;
  eventRate: Record<string, number>;
  zeroFire: string[];
  levelGainMean: number;
  weekInjuryRate: number;
  resourceZeroDay: Record<Resource, number | null>;
  meanScore: number;
  /** Share of weeks where one of the strategy's boat's weakness causes showed up in the log. */
  weaknessRate: number;
  variety: Variety;
}

/** Spec §6.6 / R8: how much the weeks differ. Step sets are `mooring_med` reconciled orders joined into a key. */
export interface Variety { mooringStepSets: number; meanWeeklyMooringSets: number; templatesSeen: number; windDirsSeen: number }
export interface VarietyWeek { state: GameState; forecastDirs: readonly Dir8[] }

const MOORING_ORDER = /^order:(ok|wrong):mooring_med$/;

function mooringKeys(state: GameState): Set<string> {
  return new Set(state.log.flatMap((e) => (MOORING_ORDER.test(e.cause) && Array.isArray(e.data?.steps) ? [e.data.steps.join('>')] : [])));
}

export function varietyOf(weeks: readonly VarietyWeek[]): Variety {
  const perWeek = weeks.map((w) => mooringKeys(w.state));
  return {
    mooringStepSets: new Set(perWeek.flatMap((k) => [...k])).size,
    meanWeeklyMooringSets: mean(perWeek.map((k) => k.size)),
    templatesSeen: new Set(weeks.map((w) => w.state.weatherTemplateId)).size,
    windDirsSeen: new Set(weeks.flatMap((w) => w.forecastDirs)).size,
  };
}

function levelGain(state: GameState): number {
  const start = sum(
    TRAINABLE_VOICES.map((v) => {
      const e = state.log.find((x) => x.kind === 'decision' && x.cause.startsWith(`voices:${v}:`));
      return e ? Number(e.cause.split(':')[2]) : 0;
    }),
  );
  return sum(TRAINABLE_VOICES.map((v) => state.voices[v])) - start;
}

export function runBatch(content: Content, strategy: Strategy, seeds: readonly number[]): BatchStats {
  const runs = seeds.map((seed) => runWeek(content, seed, strategy));
  const weeks = runs.length;
  const eventRate = Object.fromEntries(
    content.events.map((e) => [e.id, weeks === 0 ? 0 : runs.filter((r) => r.state.firedEvents.includes(e.id)).length / weeks]),
  );
  const firstZeroDays = (r: Resource) =>
    runs.flatMap((run) => {
      const hit = run.state.log.find((e) => e.cause === `zero:${r}`);
      return hit ? [hit.day] : [];
    });
  const resourceZeroDay = Object.fromEntries(
    RESOURCES.map((r) => {
      const days = firstZeroDays(r);
      return [r, days.length === 0 ? null : mean(days)];
    }),
  ) as Record<Resource, number | null>;
  return {
    weeks,
    eventRate,
    zeroFire: Object.keys(eventRate).filter((id) => eventRate[id] === 0),
    levelGainMean: mean(runs.map((r) => levelGain(r.state))),
    weekInjuryRate: weeks === 0 ? 0 : runs.filter((r) => r.state.injuries > 0).length / weeks,
    resourceZeroDay,
    meanScore: mean(runs.map((r) => weekScore(r.debrief))),
    weaknessRate: weeks === 0 ? 0 : runs.filter((r) => weaknessHit(r.state, strategy.boatId, content.balance.simTargets)).length / weeks,
    variety: varietyOf(runs),
  };
}

export function formatBatch(stats: BatchStats, name: string): string {
  const f = (n: number | null, d = 2) => (n === null ? 'never' : n.toFixed(d));
  const lines = [
    `## ${name} (${stats.weeks} weeks)`,
    '',
    `- mean score: ${f(stats.meanScore, 1)}/10`,
    `- level gain (mean): ${f(stats.levelGainMean)}`,
    `- week injury rate: ${f(stats.weekInjuryRate)}`,
    `- weakness rate: ${f(stats.weaknessRate)}`,
    `- variety: ${stats.variety.mooringStepSets} mooring_med step sets (${f(stats.variety.meanWeeklyMooringSets)} per week), ${stats.variety.templatesSeen} templates, ${stats.variety.windDirsSeen} wind dirs`,
    `- first zero day: ${RESOURCES.map((r) => `${r} ${stats.resourceZeroDay[r] === null ? 'never' : `day ${f(stats.resourceZeroDay[r], 1)}`}`).join(', ')}`,
    `- never fired: ${stats.zeroFire.length ? stats.zeroFire.join(', ') : 'none'}`,
    '',
    '| event | rate |',
    '| --- | --- |',
    ...Object.entries(stats.eventRate).map(([id, r]) => `| ${id} | ${r.toFixed(2)} |`),
  ];
  return lines.join('\n');
}
