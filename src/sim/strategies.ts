import { tavernaOpen, type EveningChoice } from '../engine/day/evening';
import type { MorningChoice } from '../engine/day/morning';
import { optionAvailable } from '../engine/events';
import { buildConditionContext } from '../engine/expr';
import { correctOrder } from '../engine/maneuver';
import { MANEUVER_KINDS, type CheckpointId, type Content, type DayPlan, type Effect, type EventOption, type GameEvent, type GameState, type LegPlan, type ManeuverKind, type TrainableVoice } from '../engine/types';
import { checkChance } from '../engine/voices';

export interface Strategy {
  name: 'newbie' | 'expert';
  voices: Partial<Record<TrainableVoice, number>>;
  boatId: string;
  checkpoints: CheckpointId[];
  briefingTopics: string[];
  briefingDialogues: string[];
  morning(s: GameState, c: Content): MorningChoice;
  plan(s: GameState, c: Content): DayPlan;
  chooseOption(s: GameState, c: Content, ev: GameEvent): string;
  evening(s: GameState, c: Content): EveningChoice;
}

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
  const p = checkChance(s.voices[o.check.voice], o.check.difficulty, s.resources.fatigue, c.balance);
  return p * scoreEffect(o.success) + (1 - p) * scoreEffect(o.fail);
}

const available = (s: GameState, c: Content, ev: GameEvent): EventOption[] => {
  const ctx = buildConditionContext(s, c);
  return ev.options.filter((o) => optionAvailable(o, ctx));
};

const hasTaverna = (s: GameState, c: Content): boolean =>
  (c.map.find((p) => p.id === s.locationId)?.services.taverna ?? false) && tavernaOpen(s.clockMin, c.balance);

function reversedOrders(c: Content): Partial<Record<ManeuverKind, string[]>> {
  const orders: Partial<Record<ManeuverKind, string[]>> = {};
  for (const kind of MANEUVER_KINDS) {
    const m = c.maneuvers.find((x) => x.kind === kind);
    if (m) orders[kind] = [...correctOrder(m)].reverse();
  }
  return orders;
}

export const expert: Strategy = {
  name: 'expert',
  voices: { sea_sense: 2, caution: 2, order: 3, mechanic: 2, diplomat: 2, economist: 1 },
  boatId: 'meltemi_40',
  checkpoints: ['impeller', 'toilets', 'gas', 'damage_photos', 'electrics'],
  briefingTopics: ['captain_only', 'cleats', 'loaded_lines', 'toilet'],
  briefingDialogues: ['ten_bonus'],
  morning: () => ({ openBarometer: true, dialogueId: null }),
  plan(s, c) {
    const legs = todaysLegs(EXPERT_ITINERARY, s, c);
    const legPlans: LegPlan[] = legs.map((routeId) => {
      const wind = expectedWind(s, c, routeId, true);
      return { routeId, mode: wind >= SAIL_MIN_WIND_KN ? 'sail' : 'motor', reefs: reefsFor(wind, c), genoa: 'full', course: 'direct' };
    });
    const nm = legs.reduce((sum, id) => sum + c.routes.find((r) => r.id === id)!.distanceNm, 0);
    return { departureHour: 8.5, legs: legPlans, swimStops: nm < 12 ? 1 : 0, shower: 'strict', autopilot: false };
  },
  chooseOption(s, c, ev) {
    const opts = available(s, c, ev);
    return opts.reduce((best, o) => (scoreOption(o, s, c) > scoreOption(best, s, c) ? o : best), opts[0]!).id;
  },
  evening: (s, c) => ({ dinner: hasTaverna(s, c) && s.resources.moneyEur > EXPERT_TAVERNA_MIN_MONEY ? 'taverna' : 'cook', dialogueId: 'decide_morning' }),
};

export const newbie: Strategy = {
  name: 'newbie',
  voices: { sea_sense: 0, caution: 0, order: 0, mechanic: 4, diplomat: 4, economist: 4 },
  boatId: 'aurora_45',
  checkpoints: ['sails', 'anchor'],
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
};
