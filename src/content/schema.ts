import { z } from 'zod';
import {
  CHANCE_LABELS, CHECKPOINTS, DIRS, MANEUVER_KINDS, PILLARS, VOICES,
  type Balance, type Boat, type ChanceInput, type ChanceMod, type BriefingTopic, type CrewArchetype, type DebriefRule, type Dialogue, type Effect,
  type EventOption, type GameEvent, type Maneuver, type MapPoint, type Region, type Route, type WeatherTemplate,
} from '../engine/types';

const POINT_KINDS = ['base', 'marina', 'bay', 'quay'] as const;
const SEABEDS = ['sand', 'mud', 'weed', 'rock'] as const;
const FEATURES = ['strait', 'cape', 'gulf', 'open'] as const;
const WISHES = ['beach', 'taverna', 'early_start', 'sailing', 'rest', 'swim'] as const;
const ACTIVITIES = ['swim', 'taverna', 'beach'] as const;
const EVENT_PHASES = ['morning', 'passage', 'arrival', 'evening'] as const;
const DIALOGUE_CONTEXTS = ['briefing', 'morning', 'evening'] as const;
const SHOWERS = ['strict', 'normal', 'loose'] as const;
const POS = ['upwind', 'reach', 'run'] as const;

const Id = z.string().regex(/^[a-z0-9_]+$/, 'id must be snake_case');
const Text = z.object({ ru: z.string().min(1), en: z.string().min(1) }).strict();
const Prob = z.number().min(0).max(1);
const NonNeg = z.number().min(0);
const Pos = z.number().positive();
const Int = z.number().int();
const Hour = z.number().min(0).max(24);

function fullRecord<K extends string, V extends z.ZodTypeAny>(keys: readonly K[], value: V) {
  return z.object(Object.fromEntries(keys.map((k) => [k, value])) as Record<K, V>).strict();
}

const ChanceModSchema: z.ZodType<ChanceMod> = z.object({
  if: z.string().min(1).optional(),
  per: z.string().min(1).optional(),
  add: z.number().optional(),
  mul: z.number().optional(),
  label: z.enum(CHANCE_LABELS).optional(),
}).strict()
  .refine((m) => (m.add === undefined) !== (m.mul === undefined), 'chance mod needs exactly one of add or mul')
  .refine((m) => m.per !== undefined || m.label !== undefined, 'chance mod needs a label when per is absent');

export const ChanceInputSchema: z.ZodType<ChanceInput> = z.union([
  z.number(),
  z.object({
    base: z.number(),
    mods: z.array(ChanceModSchema).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  }).strict(),
]);

export const EffectSchema: z.ZodType<Effect> = z.object({
  mood: z.number().optional(),
  fatigue: z.number().optional(),
  money: z.number().optional(),
  water: z.number().optional(),
  fuel: z.number().optional(),
  service_bank: z.number().optional(),
  starter_bank: z.number().optional(),
  gas: z.number().optional(),
  time_hours: NonNeg.optional(),
  mood_per_day: z.number().optional(),
  damage: Id.optional(),
  repair: Id.optional(),
  flag: Id.optional(),
  injury: z.boolean().optional(),
  signal: Id.optional(),
  promise: Id.optional(),
}).strict();

export const BoatSchema: z.ZodType<Boat> = z.object({
  id: Id, name: Text, lengthFt: Pos, cabins: Int.positive(), berths: Int.positive(),
  waterTankL: Pos, fuelTankL: Pos, serviceBankAh: Pos, serviceBanks: Int.positive(), starterSeparate: z.boolean(),
  solarW: NonNeg, generator: z.boolean(), electricToilet: z.boolean(), bowThruster: z.boolean(),
  motorKn: Pos, hullSpeedKn: Pos, priceEur: NonNeg, depositEur: NonNeg,
  shinyFeatures: z.array(Text),
  hiddenDefects: z.array(z.object({ id: Id, checkpoint: z.enum(CHECKPOINTS), description: Text, chargedOnReturn: Id.optional() }).strict()),
}).strict();

export const MapPointSchema: z.ZodType<MapPoint> = z.object({
  id: Id, name: Text, kind: z.enum(POINT_KINDS), x: z.number(), y: z.number(),
  seabed: z.enum(SEABEDS), depthM: Pos, shelter: fullRecord(DIRS, Prob),
  priceEur: NonNeg, placesGoneHour: Hour.nullable(),
  services: z.object({ water: z.boolean(), fuel: z.boolean(), shorePower: z.boolean(), gas: z.boolean(), taverna: z.boolean(), beach: z.boolean() }).strict(),
}).strict();

export const RouteSchema: z.ZodType<Route> = z.object({
  id: Id, from: Id, to: Id, distanceNm: Pos, kLocal: Pos, features: z.array(z.enum(FEATURES)),
}).strict();

export const RegionSchema: z.ZodType<Region> = z.object({
  id: Id, name: Text, map: z.array(MapPointSchema).min(2), routes: z.array(RouteSchema).min(1),
}).strict();

export const WeatherTemplateSchema: z.ZodType<WeatherTemplate> = z.object({
  id: Id, name: Text, afternoonFactor: Pos,
  days: z.array(z.object({ day: Int.positive(), windKn: NonNeg, gustKn: NonNeg, dir: z.enum(DIRS), frontChance: Prob, barometerHpa: Pos }).strict()).min(1),
}).strict();

export const CrewArchetypeSchema: z.ZodType<CrewArchetype> = z.object({
  id: Id, name: Text, names: z.array(Text).min(1), wishes: z.array(z.enum(WISHES)),
  seasickness: Prob, patience: Prob, promiseSensitivity: Pos,
}).strict();

export const BriefingTopicSchema: z.ZodType<BriefingTopic> = z.object({ id: Id, title: Text, description: Text }).strict();

const ExpectationSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('depart_by'), hour: Hour }).strict(),
  z.object({ kind: z.literal('arrive_at_kind'), pointKind: z.enum(POINT_KINDS) }).strict(),
  z.object({ kind: z.literal('activity'), activity: z.enum(ACTIVITIES) }).strict(),
  z.object({ kind: z.literal('none') }).strict(),
]);

export const DialogueSchema: z.ZodType<Dialogue> = z.object({
  id: Id, contexts: z.array(z.enum(DIALOGUE_CONTEXTS)).min(1), said: Text, heard: Text, strength: Prob, expectation: ExpectationSchema,
}).strict();

const OptionSchema: z.ZodType<EventOption> = z.object({
  id: Id, text: Text, requires: z.array(z.string().min(1)).optional(),
  check: z.object({ voice: z.enum(VOICES), difficulty: Int.min(0).max(6) }).strict().optional(),
  success: EffectSchema.optional(), fail: EffectSchema.optional(), effects: EffectSchema.optional(),
}).strict().refine(
  (o) => (o.check && o.success && o.fail && !o.effects) || (!o.check && !o.success && !o.fail && o.effects),
  { message: 'option needs either check+success+fail or effects' },
);

export const GameEventSchema: z.ZodType<GameEvent> = z.object({
  id: Id, pillar: z.enum(PILLARS),
  trigger: z.object({ phase: z.enum(EVENT_PHASES), conditions: z.array(z.string().min(1)), chance: ChanceInputSchema, once: z.boolean().optional() }).strict(),
  scene: Id, text: Text,
  voices: z.array(z.object({ voice: z.enum(VOICES), min_level: Int.min(0), text: Text }).strict()),
  options: z.array(OptionSchema).min(2),
  debrief: Text,
}).strict();

export const ManeuverSchema: z.ZodType<Maneuver> = z.object({
  id: Id, kind: z.enum(MANEUVER_KINDS), title: Text,
  steps: z.array(z.object({ id: Id, text: Text }).strict()).min(2),
  errors: z.array(z.object({
    id: Id, wrongIf: z.object({ first: Id, then: Id }).strict(), effect: EffectSchema,
    injuryChance: Prob, mitigatedBy: z.string().min(1).optional(), text: Text,
  }).strict()),
}).strict();

export const DebriefRuleSchema: z.ZodType<DebriefRule> = z.object({
  id: Id, pillar: z.enum(PILLARS), decision: z.string().min(1), consequence: z.string().min(1),
  signal: z.string().min(1).optional(), priority: z.number(), text: Text,
}).strict();

const Pair = z.tuple([z.number(), z.number()]);
const Triple = z.tuple([z.number(), z.number(), z.number()]);

export const BalanceSchema: z.ZodType<Balance> = z.object({
  start: z.object({ moneyEur: NonNeg, mood: NonNeg, fatigue: NonNeg, gasPct: NonNeg, serviceBankPct: NonNeg, starterBankPct: NonNeg, hour: Hour, crewSize: Int.positive() }).strict(),
  voices: z.object({ points: Int.positive(), maxLevel: Int.positive(), prideLevel: Int.min(0), crewVoiceLevel: Int.min(0), seaSenseSignalLevel: Int.min(0), mechanicExactLevel: Int.min(0), cautionRiskPerLevel: NonNeg, cautionTimePerLevel: NonNeg, orderRiskPerLevel: NonNeg }).strict(),
  water: z.object({ perPersonPerDayL: fullRecord(SHOWERS, NonNeg), zeroMoodPenalty: NonNeg }).strict(),
  fuel: z.object({ motorLph: Pos, priceEurPerL: NonNeg }).strict(),
  electric: z.object({ fridgeAhPerDay: NonNeg, pumpsAhPerDay: NonNeg, electricToiletAhPerDay: NonNeg, plotterAhPerHour: NonNeg, autopilotAhPerHour: NonNeg, engineChargeAhPerHour: NonNeg, solarAhPerWattDay: NonNeg, starterStartPct: NonNeg, starterMinPct: NonNeg, zeroServiceMoodPenalty: NonNeg }).strict(),
  gas: z.object({ pctPerDay: NonNeg, exchangeEur: NonNeg, exchangeBelowPct: NonNeg, noHotFoodMoodPenalty: NonNeg }).strict(),
  mood: z.object({ restPerHour: NonNeg, restCapHours: NonNeg, swimStop: NonNeg, tavernaDinner: NonNeg, tavernaEurPerPerson: NonNeg, overpowerPerHour: NonNeg, marinaRefused: NonNeg, rollyNight: NonNeg, injury: NonNeg, nightArrival: NonNeg }).strict(),
  fatigue: z.object({ passagePerHour: NonNeg, maneuverError: NonNeg, nightRecovery: NonNeg, rollyNightPenalty: NonNeg, rollyExposure: Prob, checkPenaltyPerPoint: NonNeg, nightArrival: NonNeg }).strict(),
  sails: z.object({
    reefThresholdKn: Triple, partialGenoaBonusKn: NonNeg, breakChancePerKnOver: NonNeg, breakChanceMax: Prob, forcedReefMarginKn: NonNeg,
    reefUnderwayMin: NonNeg, reefUnderwayInjuryChance: Prob, fullPowerWindKn: Pos, minSailWindKn: NonNeg, drifterFactor: Pos,
    overpowerSpeedFactor: Pos, posFactor: fullRecord(POS, Pos), reefFactor: Triple, partialGenoaFactor: Pos,
    detourDistanceFactor: Pos, motorUpwindPenaltyWindKn: NonNeg, motorUpwindFactor: Pos,
  }).strict(),
  time: z.object({
    earliestDepartureHour: Hour, lateDepartureHour: Hour, busyRouteNm: Pos, busyRouteLegs: Int.positive(), maxSwimStops: Int.min(0), departureMin: NonNeg,
    anchorMin: Pair, anchorFailChance: Pair, seabedFailFactor: fullRecord(SEABEDS, Prob), anchorWindPenaltyKn: NonNeg,
    anchorWindPenalty: Prob, anchorBriefedReduction: Prob, anchorMaxAttempts: Int.positive(), marinaMooringMin: NonNeg,
    marinaLateRefusalChance: Prob, marinaWaitMin: NonNeg, swimStopMin: NonNeg, sunsetHour: Hour,
    tavernaCloseHour: Hour, nightAnchorPenalty: Prob,
  }).strict(),
  promises: z.object({ keptPerStrength: NonNeg, brokenPerStrength: NonNeg, diplomatSofteningPerLevel: NonNeg }).strict(),
  checks: z.object({ base: Prob, perLevel: NonNeg, min: Prob, max: Prob }).strict(),
  checkin: z.object({ budgetMin: Pos, costMin: fullRecord(CHECKPOINTS, NonNeg) }).strict(),
  briefing: z.object({ slots: Int.positive(), maxDialogues: Int.min(0) }).strict(),
  weather: z.object({ frontAddKn: Pair, frontShiftSteps: Int, barometerDropHpa: NonNeg, afternoonFromHour: Hour }).strict(),
  schedule: z.object({ days: Int.positive(), returnDeadlineHour: Hour, lateFeeEur: NonNeg }).strict(),
  rescue: z.object({ jumpStartEur: NonNeg, jumpStartDelayMin: NonNeg, moodPenalty: NonNeg }).strict(),
  safety: z.object({ mitigationFactor: Prob }).strict(),
  deposit: z.object({ damageCostEur: z.record(NonNeg), defaultDamageEur: NonNeg }).strict(),
  grading: z.object({ crewGoodMood: NonNeg, crewOkMood: NonNeg, boatOkLossEur: NonNeg }).strict(),
  drama: z.object({ pillarWeightByDay: z.record(z.record(z.enum(PILLARS), NonNeg)) }).strict(),
}).strict();
