import { canAfford } from '../engine/budget';
import { priceFor } from '../engine/perks';
import { tavernaOpen, type EveningChoice } from '../engine/day/evening';
import type { MorningChoice } from '../engine/day/morning';
import { optionAvailable } from '../engine/events';
import { buildConditionContext } from '../engine/expr';
import { correctOrder } from '../engine/maneuver';
import { MANEUVER_KINDS, type CheckpointId, type Content, type DayPlan, type Effect, type EventOption, type GameEvent, type GameState, type LegPlan, type ManeuverKind, type TrainableVoice } from '../engine/types';
import { checkChance } from '../engine/voices';
import type { RepairChoice } from '../engine/repair';
import { weakSystems } from './weakness';

export interface Strategy {
  name: 'newbie' | 'expert' | 'careful' | 'ignore-weakness';
  voices: Partial<Record<TrainableVoice, number>>;
  boatId: string;
  checkpoints(c: Content): CheckpointId[];
  briefingTopics: string[];
  briefingDialogues: string[];
  morning(s: GameState, c: Content): MorningChoice;
  plan(s: GameState, c: Content): DayPlan;
  chooseOption(s: GameState, c: Content, ev: GameEvent): string;
  evening(s: GameState, c: Content): EveningChoice;
  /** Which of the found defects to fix at base (phase 'defects'). */
  fixDefects(found: string[], s: GameState, c: Content): string[];
  /** The repair to attempt next among the broken systems' choices, or null to stop. */
  repair(choices: RepairChoice[], s: GameState): { systemId: string; repairId: string } | null;
}

const fixNothing = (): string[] => [];
const repairNothing = (): null => null;

// Sim heuristics (not game balance): below this expected wind both proxies motor.
const SAIL_MIN_WIND_KN = 8;
const EXPERT_TAVERNA_MIN_MONEY = 600;

const EXPERT_ITINERARY: Record<number, string[]> = {
  1: ['r_base_marina_cala_azzurra'],
  2: ['r_cala_azzurra_kastri_marina'],
  3: ['r_kastri_marina_nisi_quay'],
  4: ['r_cala_azzurra_nisi_quay'],
  5: ['r_base_marina_cala_azzurra', 'r_base_marina_blue_lagoon'],
  6: ['r_base_marina_blue_lagoon'],
};

const NEWBIE_ITINERARY: Record<number, string[]> = {
  1: ['r_base_marina_cala_azzurra', 'r_cala_azzurra_nisi_quay', 'r_nisi_quay_capo_rosso_bay'],
  2: ['r_capo_rosso_bay_porto_lungo_marina'],
  3: ['r_base_marina_porto_lungo_marina', 'r_base_marina_cala_azzurra', 'r_cala_azzurra_kastri_marina'],
  4: ['r_kastri_marina_fjord_bay'],
  5: ['r_kastri_marina_fjord_bay', 'r_kastri_marina_nisi_quay', 'r_cala_azzurra_nisi_quay'],
  6: ['r_cala_azzurra_vela_bay', 'r_vela_bay_blue_lagoon', 'r_base_marina_blue_lagoon'],
};

/** Today's legs if they chain from the current location; otherwise stay put. */
function todaysLegs(itinerary: Record<number, string[]>, s: GameState, c: Content): string[] {
  const legs = itinerary[s.day] ?? [];
  let at = s.locationId;
  for (const id of legs) {
    const r = c.routes.find((x) => x.id === id);
    const next = r ? (r.from === at ? r.to : r.to === at ? r.from : null) : null;
    if (!next) return [];
    at = next;
  }
  return legs;
}

function expectedWind(s: GameState, c: Content, routeId: string, readsSignals: boolean): number {
  const w = s.weather!;
  const route = c.routes.find((r) => r.id === routeId)!;
  const template = c.weather.find((t) => t.id === s.weatherTemplateId)!;
  const front = readsSignals && w.signalsVisible && w.front ? w.frontAddKn : 0;
  return w.forecastKn * template.afternoonFactor * route.kLocal + front;
}

function reefsFor(windKn: number, c: Content): 0 | 1 | 2 {
  const [r0, r1] = c.balance.sails.reefThresholdKn;
  if (windKn <= r0) return 0;
  return windKn <= r1 ? 1 : 2;
}

function scoreEffect(e: Effect | undefined): number {
  if (!e) return 0;
  return (e.mood ?? 0) + (e.money ?? 0) / 20 - (e.fatigue ?? 0) / 2 - (e.time_hours ?? 0) * 3
    + (e.mood_per_day ?? 0) * 3 - (e.damage ? 40 : 0) - (e.injury ? 100 : 0) - (e.promise ? 5 : 0);
}

function scoreOption(o: EventOption, s: GameState, c: Content): number {
  if (!o.check) return scoreEffect(o.effects);
  const p = checkChance(o.check, buildConditionContext(s, c), c.balance).value;
  return p * scoreEffect(o.success) + (1 - p) * scoreEffect(o.fail);
}

const available = (s: GameState, c: Content, ev: GameEvent): EventOption[] => {
  const ctx = buildConditionContext(s, c);
  return ev.options.filter((o) => optionAvailable(o, ctx));
};

const hasTaverna = (s: GameState, c: Content): boolean => {
  const bill = priceFor(s.crew.length * c.balance.mood.tavernaEurPerPerson, s.voices.economist, c.balance).eur;
  return (c.map.find((p) => p.id === s.locationId)?.services.taverna ?? false) && tavernaOpen(s.clockMin, c.balance) && canAfford(s, bill);
};

function reversedOrders(c: Content): Partial<Record<ManeuverKind, string[]>> {
  const orders: Partial<Record<ManeuverKind, string[]>> = {};
  for (const kind of MANEUVER_KINDS) {
    const m = c.maneuvers.find((x) => x.kind === kind);
    if (m) orders[kind] = [...correctOrder(m)].reverse();
  }
  return orders;
}

function expertPlan(legs: string[], s: GameState, c: Content): DayPlan {
  const legPlans: LegPlan[] = legs.map((routeId) => {
    const wind = expectedWind(s, c, routeId, true);
    return { routeId, mode: wind >= SAIL_MIN_WIND_KN ? 'sail' : 'motor', reefs: reefsFor(wind, c), genoa: 'full', course: 'direct' };
  });
  const nm = legs.reduce((sum, id) => sum + c.routes.find((r) => r.id === id)!.distanceNm, 0);
  return { departureHour: 8.5, legs: legPlans, swimStops: nm < 12 ? 1 : 0, shower: 'strict', autopilot: false };
}

export const expert: Strategy = {
  name: 'expert',
  voices: { sea_sense: 2, caution: 2, order: 3, mechanic: 2, diplomat: 2, economist: 1 },
  boatId: 'meltemi_40',
  checkpoints: () => ['impeller', 'toilets', 'gas', 'damage_photos'],
  briefingTopics: ['captain_only', 'cleats', 'loaded_lines', 'toilet'],
  briefingDialogues: ['ten_bonus'],
  morning: () => ({ openBarometer: true, dialogueId: null }),
  plan: (s, c) => expertPlan(todaysLegs(EXPERT_ITINERARY, s, c), s, c),
  chooseOption(s, c, ev) {
    const opts = available(s, c, ev);
    return opts.reduce((best, o) => (scoreOption(o, s, c) > scoreOption(best, s, c) ? o : best), opts[0]!).id;
  },
  evening: (s, c) => ({ dinner: hasTaverna(s, c) && s.resources.moneyEur > EXPERT_TAVERNA_MIN_MONEY ? 'taverna' : 'cook', dialogueId: 'decide_morning' }),
  fixDefects: fixNothing,
  repair: repairNothing,
};

export const newbie: Strategy = {
  name: 'newbie',
  voices: { sea_sense: 0, caution: 0, order: 0, mechanic: 4, diplomat: 4, economist: 4 },
  boatId: 'aurora_45',
  checkpoints: () => ['sails', 'anchor'],
  briefingTopics: ['sails', 'mob', 'fenders', 'anchor'],
  briefingDialogues: ['early_try', 'beach_week'],
  morning: () => ({ openBarometer: false, dialogueId: 'early_try' }),
  plan(s, c) {
    const legs = todaysLegs(NEWBIE_ITINERARY, s, c).map((routeId): LegPlan => ({
      routeId, mode: expectedWind(s, c, routeId, false) >= SAIL_MIN_WIND_KN ? 'sail' : 'motor', reefs: 0, genoa: 'full', course: 'direct',
    }));
    return { departureHour: 10.5, legs, swimStops: 2, shower: 'loose', autopilot: true, maneuverOrders: reversedOrders(c) };
  },
  chooseOption: (s, c, ev) => available(s, c, ev)[0]!.id,
  evening: (s, c) => ({ dinner: hasTaverna(s, c) ? 'taverna' : 'cook', dialogueId: 'promise_taverna' }),
  fixDefects: fixNothing,
  repair: repairNothing,
};

// --- Weakness-aware proxies: expert play on any boat, differing in how they treat the boat's weak systems.

type Style = 'careful' | 'ignore-weakness';
const NIGHT_BERTH_KINDS = new Set(['marina', 'quay', 'base']);

/**
 * One leg per day, built from the region graph, ending at base on the last day.
 * careful: anchorage on odd nights, berth on even nights, never two anchorages in a row.
 * ignore-weakness: an anchorage (bay) every night it can. Deterministic: ties break on visit count, then route id.
 */
export function buildItinerary(c: Content, style: Style): Record<number, string[]> {
  const base = c.map.find((p) => p.kind === 'base')!;
  const days = c.balance.schedule.days;
  const kindOf = (id: string) => c.map.find((p) => p.id === id)!.kind;
  const visits = new Map<string, number>();
  const rank = (day: number, to: string): number => {
    const berth = NIGHT_BERTH_KINDS.has(kindOf(to));
    if (style === 'ignore-weakness') return kindOf(to) === 'bay' ? 0 : 1;
    return (day % 2 === 0) === berth ? 0 : 1;
  };
  const walk = (day: number, at: string, prevBerth: boolean): string[] | null => {
    if (day > days) return at === base.id ? [] : null;
    const options = c.routes
      .flatMap((r) => (r.from === at ? [{ id: r.id, to: r.to }] : r.to === at ? [{ id: r.id, to: r.from }] : []))
      .filter((o) => (day === days ? o.to === base.id : true))
      .filter((o) => style !== 'careful' || day === days || prevBerth || NIGHT_BERTH_KINDS.has(kindOf(o.to)))
      .sort((a, b) => rank(day, a.to) - rank(day, b.to) || (visits.get(a.to) ?? 0) - (visits.get(b.to) ?? 0) || a.id.localeCompare(b.id));
    for (const o of options) {
      visits.set(o.to, (visits.get(o.to) ?? 0) + 1);
      const rest = walk(day + 1, o.to, NIGHT_BERTH_KINDS.has(kindOf(o.to)));
      if (rest) return [o.id, ...rest];
      visits.set(o.to, (visits.get(o.to) ?? 0) - 1);
    }
    return null;
  };
  const legs = walk(1, base.id, true) ?? [];
  return Object.fromEntries(legs.map((id, i) => [i + 1, [id]]));
}

/** Greedy by cost within the check-in budget; `first` checkpoints are tried before the rest. */
function greedyCheckpoints(c: Content, first: readonly CheckpointId[], skip: readonly CheckpointId[]): CheckpointId[] {
  const costs = c.balance.checkin.costMin;
  const byCost = (ids: CheckpointId[]) => [...ids].sort((a, b) => costs[a] - costs[b]);
  const all = Object.keys(costs) as CheckpointId[];
  const ordered = [...byCost(all.filter((id) => first.includes(id))), ...byCost(all.filter((id) => !first.includes(id) && !skip.includes(id)))];
  const picked: CheckpointId[] = [];
  let used = 0;
  for (const id of ordered) {
    if (skip.includes(id) || used + costs[id] > c.balance.checkin.budgetMin) continue;
    picked.push(id);
    used += costs[id];
  }
  return picked;
}

function weakCheckpoints(c: Content, boatId: string): CheckpointId[] {
  const weak = weakSystems(boatId, c.balance.simTargets);
  return c.systems.flatMap((d) => (weak.includes(d.id) && d.checkpoint ? [d.checkpoint] : []));
}

/** Every found defect that still fits the remaining minutes and money, in found order. */
function fixWhatFits(found: string[], s: GameState, c: Content): string[] {
  const boat = c.boats.find((b) => b.id === s.boatId);
  let minutes = s.checkin?.minutesLeft ?? 0;
  let eur = s.resources.moneyEur;
  const fixes: string[] = [];
  for (const id of found) {
    const d = boat?.defectPool.find((x) => x.id === id);
    if (!d?.system || (d.fixMin ?? 0) > minutes || (d.fixEur ?? 0) > eur) continue;
    minutes -= d.fixMin ?? 0;
    eur -= d.fixEur ?? 0;
    fixes.push(id);
  }
  return fixes;
}

/** The available option most likely to work (no check = certain), cheapest on ties. */
function bestRepair(choices: RepairChoice[]): { systemId: string; repairId: string } | null {
  const best = choices
    .filter((ch) => ch.available)
    .sort((a, b) => (b.odds?.value ?? 1) - (a.odds?.value ?? 1) || (a.option.costEur ?? 0) - (b.option.costEur ?? 0))[0];
  return best ? { systemId: best.systemId, repairId: best.option.id } : null;
}

function weaknessStrategy(style: Style, boatId: string): Strategy {
  return {
    ...expert,
    name: style,
    boatId,
    checkpoints: (c) => {
      const weak = weakCheckpoints(c, boatId);
      return style === 'careful' ? greedyCheckpoints(c, weak, []) : greedyCheckpoints(c, [], weak);
    },
    plan: (s, c) => expertPlan(todaysLegs(buildItinerary(c, style), s, c), s, c),
    fixDefects: style === 'careful' ? fixWhatFits : fixNothing,
    repair: style === 'careful' ? bestRepair : repairNothing,
  };
}

export function makeStrategy(name: Strategy['name'], boatId?: string): Strategy {
  if (name === 'newbie') return newbie;
  if (name === 'expert') return expert;
  return weaknessStrategy(name, boatId ?? expert.boatId);
}
