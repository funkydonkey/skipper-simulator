import { causeMatches } from './log';
import { requireBoat } from './state';
import type { Balance, Boat, Content, DebriefRule, GameState, Grade, LocalizedText, LogEntry, Pillar } from './types';

export interface DebriefLink { ruleId: string; pillar: Pillar; text: LocalizedText; decision: LogEntry; consequence: LogEntry; signal: LogEntry | null }
export interface WeekScales { safety: Grade; crew: Grade; boat: Grade; schedule: Grade }
export interface Debrief { scales: WeekScales; depositLossEur: number; depositReturnedEur: number; links: DebriefLink[]; eventNotes: LocalizedText[] }

export function depositLoss(damages: readonly string[], b: Balance): number {
  return damages.reduce((sum, d) => sum + (b.deposit.damageCostEur[d] ?? b.deposit.defaultDamageEur), 0);
}

export function gradeWeek(state: GameState, boat: Boat, b: Balance): { scales: WeekScales; depositLossEur: number; depositReturnedEur: number } {
  const loss = depositLoss(state.damages, b);
  const nearMiss = state.log.some((e) => e.kind === 'effect' && causeMatches(e.cause, 'maneuver'));
  const mood = state.resources.mood;
  const crew: Grade = mood >= b.grading.crewGoodMood ? 'good' : mood >= b.grading.crewOkMood ? 'ok' : 'bad';
  const boatGrade: Grade = loss === 0 ? 'good' : loss <= b.grading.boatOkLossEur ? 'ok' : 'bad';
  return {
    scales: {
      safety: state.injuries > 0 ? 'bad' : nearMiss ? 'ok' : 'good',
      crew,
      boat: boatGrade,
      schedule: state.returnedOnTime === true ? 'good' : 'bad',
    },
    depositLossEur: loss,
    depositReturnedEur: Math.max(0, boat.depositEur - loss),
  };
}

export function findLinks(log: readonly LogEntry[], rules: readonly DebriefRule[], max: number): DebriefLink[] {
  const links: DebriefLink[] = [];
  for (const rule of [...rules].sort((a, b) => b.priority - a.priority)) {
    if (links.length >= max) break;
    const di = log.findIndex((e) => causeMatches(e.cause, rule.decision));
    if (di < 0) continue;
    const ci = log.findIndex((e, i) => i >= di && causeMatches(e.cause, rule.consequence));
    if (ci < 0) continue;
    const signal = rule.signal ? log.find((e, i) => i <= ci && causeMatches(e.cause, rule.signal!)) ?? null : null;
    links.push({ ruleId: rule.id, pillar: rule.pillar, text: rule.text, decision: log[di]!, consequence: log[ci]!, signal });
  }
  return links;
}

export function buildDebrief(state: GameState, content: Content, maxItems = 5): Debrief {
  const graded = gradeWeek(state, requireBoat(content, state), content.balance);
  const links = findLinks(state.log, content.debrief, maxItems);
  const covered = (eventId: string): boolean => links.some((l) => causeMatches(l.consequence.cause, `event:${eventId}`));
  const eventNotes = state.firedEvents
    .filter((id) => !covered(id))
    .map((id) => content.events.find((e) => e.id === id)?.debrief)
    .filter((t): t is LocalizedText => t !== undefined)
    .slice(0, Math.max(0, maxItems - links.length));
  return { ...graded, links, eventNotes };
}
