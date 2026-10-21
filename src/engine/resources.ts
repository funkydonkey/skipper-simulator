import { EngineError } from './errors';
import { appendLog, causeMatches } from './log';
import { advanceClock, clamp, round1 } from './state';
import { priceFor } from './perks';
import { applySystemEffect } from './systems';
import { grantXp } from './xp';
import type { Balance, Boat, Effect, GameState, MapPoint, Outcome, Resources, ShowerDiscipline } from './types';

const EFFECT_TO_RESOURCE = {
  mood: 'mood',
  fatigue: 'fatigue',
  money: 'moneyEur',
  water: 'waterL',
  fuel: 'fuelL',
  service_bank: 'serviceBankPct',
  starter_bank: 'starterBankPct',
  gas: 'gasPct',
} as const satisfies Partial<Record<keyof Effect, keyof Resources>>;

type ResourceEffectKey = keyof typeof EFFECT_TO_RESOURCE;

export function clampResources(r: Resources, boat: Boat | null): Resources {
  const pct = (v: number): number => clamp(v, 0, 100);
  return {
    waterL: clamp(r.waterL, 0, boat?.waterTankL ?? Infinity),
    fuelL: clamp(r.fuelL, 0, boat?.fuelTankL ?? Infinity),
    serviceBankPct: pct(r.serviceBankPct),
    starterBankPct: pct(r.starterBankPct),
    gasPct: pct(r.gasPct),
    moneyEur: r.moneyEur,
    mood: pct(r.mood),
    fatigue: pct(r.fatigue),
  };
}

function rawResources(before: Resources, e: Effect, boat: Boat | null): Resources {
  const raw = { ...before };
  for (const key of Object.keys(EFFECT_TO_RESOURCE) as ResourceEffectKey[]) {
    const v = e[key];
    if (v) raw[EFFECT_TO_RESOURCE[key]] += v;
  }
  if (boat && !boat.starterSeparate && e.service_bank && !e.starter_bank) raw.starterBankPct += e.service_bank;
  return raw;
}

function diff(before: Resources, after: Resources): Partial<Record<keyof Resources, number>> {
  const delta: Partial<Record<keyof Resources, number>> = {};
  for (const k of Object.keys(before) as (keyof Resources)[]) {
    const d = round1(after[k] - before[k]);
    if (d !== 0) delta[k] = d;
  }
  return delta;
}

function effectData(e: Effect): Record<string, string | number | boolean> | undefined {
  const data: Record<string, string | number | boolean> = {};
  if (e.damage) data.damage = e.damage;
  if (e.repair) data.repair = e.repair;
  if (e.break) data.break = e.break;
  if (e.wear) data.wear = Object.entries(e.wear).map(([id, w]) => `${id}:${w}`).join(',');
  if (e.flag) data.flag = e.flag;
  if (e.injury) data.injury = true;
  if (e.time_hours) data.time_hours = e.time_hours;
  if (e.mood_per_day) data.mood_per_day = e.mood_per_day;
  return Object.keys(data).length ? data : undefined;
}

/** `b` is required only for outcomes that carry `effect.xp`. */
export function applyOutcome(state: GameState, boat: Boat | null, o: Outcome, b?: Balance): GameState {
  const e = o.effect;
  const resources = clampResources(rawResources(state.resources, e, boat), boat);
  const damages = e.damage && !state.damages.includes(e.damage) ? [...state.damages, e.damage] : state.damages;
  let s: GameState = {
    ...state,
    resources,
    damages,
    systems: applySystemEffect(state.systems, e),
    flags: e.flag ? { ...state.flags, [`flag.${e.flag}`]: true } : state.flags,
    injuries: state.injuries + (e.injury ? 1 : 0),
    moodPerDay: state.moodPerDay + (e.mood_per_day ?? 0),
  };
  if (e.time_hours) s = advanceClock(s, e.time_hours * 60);
  const delta = diff(state.resources, resources);
  const data = effectData(e);
  s = appendLog(s, {
    kind: 'effect',
    cause: o.cause,
    ...(o.pillar ? { pillar: o.pillar } : {}),
    ...(Object.keys(delta).length ? { delta } : {}),
    ...(data ? { data } : {}),
    ...(o.odds ? { odds: o.odds } : {}),
  });
  if (e.break && state.systems[e.break]?.broken === false) {
    s = appendLog(s, { kind: 'effect', cause: `break:${e.break}`, pillar: 'boat' });
  }
  if (e.injury && !causeMatches(o.cause, 'injury')) {
    s = appendLog(s, { kind: 'effect', cause: `injury:${o.cause}`, ...(o.pillar ? { pillar: o.pillar } : {}) });
  }
  if (o.saved && o.saved > 0) {
    s = appendLog(s, { kind: 'info', cause: 'voice:economist:saved', ...(o.pillar ? { pillar: o.pillar } : {}), data: { eur: o.saved, for: o.cause } });
  }
  if (e.signal) s = appendLog(s, { kind: 'signal', cause: `signal:${e.signal}`, ...(o.pillar ? { pillar: o.pillar } : {}) });
  if (e.xp) {
    if (!b) throw new EngineError('INVALID_INPUT', `Outcome ${o.cause} carries xp: pass the balance to applyOutcome`);
    s = grantXp(s, e.xp, o.cause, b);
  }
  return s;
}

export function applyOutcomes(state: GameState, boat: Boat | null, outcomes: readonly Outcome[], b?: Balance): GameState {
  return outcomes.reduce((s, o) => applyOutcome(s, boat, o, b), state);
}

export interface ConsumptionInput {
  crewSize: number;
  shower: ShowerDiscipline;
  boat: Boat;
  motorHours: number;
  sailHours: number;
  autopilotHours: number;
  shorePower: boolean;
  cookedDinner: boolean;
  /** Broken electrical system (alternator): the engine charges neither bank; solar panels still charge the service bank. */
  noCharge?: boolean;
}

export function dailyConsumption(i: ConsumptionInput, b: Balance): Outcome[] {
  const el = b.electric;
  const capacityAh = i.boat.serviceBankAh * i.boat.serviceBanks;
  const drawAh = el.fridgeAhPerDay + el.pumpsAhPerDay
    + (i.boat.electricToilet ? el.electricToiletAhPerDay : 0)
    + (i.motorHours + i.sailHours) * el.plotterAhPerHour
    + i.autopilotHours * el.autopilotAhPerHour;
  const engineAh = i.noCharge ? 0 : i.motorHours * el.engineChargeAhPerHour;
  const chargeAh = engineAh + i.boat.solarW * el.solarAhPerWattDay;
  const out: Outcome[] = [
    { cause: 'consumption:water', pillar: 'boat', effect: { water: -i.crewSize * b.water.perPersonPerDayL[i.shower] } },
    i.shorePower
      ? { cause: 'charge:shore', pillar: 'boat', effect: { service_bank: 100 } }
      : { cause: 'consumption:electric', pillar: 'boat', effect: { service_bank: round1(((chargeAh - drawAh) / capacityAh) * 100) } },
  ];
  if (i.boat.starterSeparate && i.motorHours > 0 && !i.noCharge) out.push({ cause: 'charge:starter', pillar: 'boat', effect: { starter_bank: 100 } });
  if (i.cookedDinner) out.push({ cause: 'consumption:gas', pillar: 'boat', effect: { gas: -b.gas.pctPerDay } });
  return out;
}

export function refillAt(state: GameState, boat: Boat, point: MapPoint, b: Balance): Outcome[] {
  const r = state.resources;
  const out: Outcome[] = [];
  const water = boat.waterTankL - r.waterL;
  if (point.services.water && water > 0) out.push({ cause: 'refill:water', pillar: 'boat', effect: { water } });
  const fuel = round1(boat.fuelTankL - r.fuelL);
  const level = state.voices.economist;
  if (point.services.fuel && fuel > 0) {
    const price = priceFor(round1(fuel * b.fuel.priceEurPerL), level, b);
    out.push({ cause: 'refill:fuel', pillar: 'boat', effect: { fuel, money: -price.eur }, saved: price.savedEur });
  }
  if (point.services.gas && r.gasPct < b.gas.exchangeBelowPct) {
    const price = priceFor(b.gas.exchangeEur, level, b);
    out.push({ cause: 'refill:gas', pillar: 'boat', effect: { gas: 100 - r.gasPct, money: -price.eur }, saved: price.savedEur });
  }
  return out;
}

export function zeroResourceOutcomes(state: GameState, b: Balance): Outcome[] {
  const out: Outcome[] = [];
  if (state.resources.waterL <= 0) out.push({ cause: 'zero:water', pillar: 'boat', effect: { mood: -b.water.zeroMoodPenalty } });
  if (state.resources.serviceBankPct <= 0) out.push({ cause: 'zero:service', pillar: 'boat', effect: { mood: -b.electric.zeroServiceMoodPenalty } });
  return out;
}
