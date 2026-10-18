import { buildDebrief, type Debrief } from '../engine/debrief';
import { endDay, finishWeek } from '../engine/day/evening';
import { startDay } from '../engine/day/morning';
import { planDay } from '../engine/day/passage';
import { resolvePendingEvent } from '../engine/events';
import { assignVoices, chooseBoat, newGame, performBriefing, performCheckin } from '../engine/setup';
import { requireEvent } from '../engine/state';
import type { Content, GameState, Grade, Lang, Pillar } from '../engine/types';
import type { Strategy } from './strategies';

export interface WeekResult { state: GameState; debrief: Debrief }

const GRADE_POINTS: Record<Grade, number> = { good: 2, ok: 1, bad: 0 };

export function setupWeek(content: Content, seed: number, strategy: Strategy, lang: Lang = 'ru'): GameState {
  let s = newGame(content, { seed, lang });
  s = assignVoices(s, content, strategy.voices);
  s = chooseBoat(s, content, strategy.boatId);
  s = performCheckin(s, content, strategy.checkpoints);
  return performBriefing(s, content, strategy.briefingTopics, strategy.briefingDialogues);
}

export function drainEvents(state: GameState, content: Content, strategy: Strategy): GameState {
  let s = state;
  while (s.eventQueue.length > 0) {
    const ev = requireEvent(content, s.eventQueue[0]!);
    s = resolvePendingEvent(s, content, strategy.chooseOption(s, content, ev));
  }
  return s;
}

export function playDay(state: GameState, content: Content, strategy: Strategy): GameState {
  let s = drainEvents(startDay(state, content, strategy.morning(state, content)), content, strategy);
  s = drainEvents(planDay(s, content, strategy.plan(s, content)), content, strategy);
  return endDay(s, content, strategy.evening(s, content));
}

export function runWeek(content: Content, seed: number, strategy: Strategy): WeekResult {
  let s = setupWeek(content, seed, strategy);
  while (s.phase === 'morning') s = playDay(s, content, strategy);
  s = finishWeek(s, content);
  return { state: s, debrief: buildDebrief(s, content) };
}

export function weekScore(d: Debrief): number {
  const grades: Grade[] = [d.scales.safety, d.scales.crew, d.scales.boat, d.scales.schedule];
  return grades.reduce((sum, g) => sum + GRADE_POINTS[g], 0);
}

/** Pillars that changed resources, damages, flags or injuries at least once. */
export function pillarsAffected(state: GameState): Set<Pillar> {
  return new Set(state.log.filter((e) => e.kind === 'effect' && e.pillar && (e.delta || e.data)).map((e) => e.pillar!));
}
