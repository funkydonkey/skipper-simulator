import { budgetGrade, weekSpend } from './budget';
import { causeMatches } from './log';
import { requireBoat } from './state';
import { voiceReport, type VoiceReport } from './voice-report';
import type { Balance, Boat, Content, DebriefRule, GameState, Grade, LocalizedText, LogEntry, Pillar } from './types';

export interface DebriefLink { ruleId: string; pillar: Pillar; text: LocalizedText; decision: LogEntry; consequence: LogEntry; signal: LogEntry | null }
export interface WeekScales { safety: Grade; crew: Grade; boat: Grade; schedule: Grade; budget: Grade }
export interface Debrief { scales: WeekScales; depositLossEur: number; depositReturnedEur: number; links: DebriefLink[]; eventNotes: LocalizedText[]; voices: VoiceReport[] }

export function depositLoss(damages: readonly string[], b: Balance): number {
  return damages.reduce((sum, d) => sum + (b.deposit.damageCostEur[d] ?? b.deposit.defaultDamageEur), 0);
}

/** Charges logged at the return for systems handed back broken. */
const brokenReturnLoss = (log: readonly LogEntry[]): number =>
  log.reduce((sum, e) => (causeMatches(e.cause, 'deposit:broken') ? sum + (typeof e.data?.eur === 'number' ? e.data.eur : 0) : sum), 0);

export function gradeWeek(state: GameState, boat: Boat, b: Balance): { scales: WeekScales; depositLossEur: number; depositReturnedEur: number } {
  const loss = depositLoss(state.damages, b) + brokenReturnLoss(state.log);
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
      budget: budgetGrade(weekSpend(state, loss), state.resources.moneyEur, b),
    },
    depositLossEur: loss,
    depositReturnedEur: Math.max(0, boat.depositEur - loss),
  };
}

/** Decisions with these roots only explain consequences on the same day. */
const SAME_DAY_DECISION_ROOTS = ['plan', 'barometer', 'order'];
const SAME_DAY_SIGNAL_ROOTS = ['signal'];

const root = (pattern: string): string => pattern.split(':')[0]!;

/** Index of the latest entry below `end` matching pattern; restricted to `day` when the pattern root demands it. */
function latestMatch(log: readonly LogEntry[], pattern: string, end: number, day: number, sameDayRoots: readonly string[]): number {
  const sameDay = sameDayRoots.includes(root(pattern));
  for (let i = end - 1; i >= 0; i--) {
    const e = log[i]!;
    if (sameDay && e.day !== day) continue;
    if (causeMatches(e.cause, pattern)) return i;
  }
  return -1;
}

/** Consequence-first: the first unclaimed consequence that has a matching earlier decision. */
function linkForRule(log: readonly LogEntry[], rule: DebriefRule, claimed: ReadonlySet<number>): { link: DebriefLink; ci: number } | null {
  for (let ci = 0; ci < log.length; ci++) {
    if (claimed.has(ci) || !causeMatches(log[ci]!.cause, rule.consequence)) continue;
    const day = log[ci]!.day;
    const di = latestMatch(log, rule.decision, ci, day, SAME_DAY_DECISION_ROOTS);
    if (di < 0) continue;
    const si = rule.signal ? latestMatch(log, rule.signal, ci + 1, day, SAME_DAY_SIGNAL_ROOTS) : -1;
    const signal = si >= 0 ? log[si]! : null;
    return { link: { ruleId: rule.id, pillar: rule.pillar, text: rule.text, decision: log[di]!, consequence: log[ci]!, signal }, ci };
  }
  return null;
}

/**
 * Pass 1 picks the best link per pillar (by priority), pass 2 fills the remaining slots by priority.
 * Each log entry is the consequence of at most one link.
 */
export function findLinks(log: readonly LogEntry[], rules: readonly DebriefRule[], max: number): DebriefLink[] {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  const pick = (acc: { links: DebriefLink[]; claimed: Set<number> }, rule: DebriefRule, pillarPass: boolean) => {
    if (acc.links.length >= max || acc.links.some((l) => l.ruleId === rule.id)) return acc;
    if (pillarPass && acc.links.some((l) => l.pillar === rule.pillar)) return acc;
    const found = linkForRule(log, rule, acc.claimed);
    return found ? { links: [...acc.links, found.link], claimed: new Set([...acc.claimed, found.ci]) } : acc;
  };
  const firstPass = sorted.reduce((acc, r) => pick(acc, r, true), { links: [] as DebriefLink[], claimed: new Set<number>() });
  return sorted.reduce((acc, r) => pick(acc, r, false), firstPass).links;
}

export function buildDebrief(state: GameState, content: Content, maxItems = 5): Debrief {
  const graded = gradeWeek(state, requireBoat(content, state), content.balance);
  const links = findLinks(state.log, content.debrief, maxItems);
  const covered = (eventId: string): boolean =>
    links.some((l) => causeMatches(l.consequence.cause, `event:${eventId}`) || causeMatches(l.consequence.cause, `injury:event:${eventId}`));
  const eventNotes = state.firedEvents
    .filter((id) => !covered(id))
    .map((id) => content.events.find((e) => e.id === id)?.debrief)
    .filter((t): t is LocalizedText => t !== undefined)
    .slice(0, Math.max(0, maxItems - links.length));
  return { ...graded, links, eventNotes, voices: voiceReport(state) };
}
