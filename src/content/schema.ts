import { z } from 'zod';
import { pointBerthProblem } from '../engine/berths';
import {
  BERTH_TYPES, CHANCE_LABELS, CHECKPOINTS, DIRS, MANEUVER_KINDS, PILLARS, TRAINABLE_VOICES, VOICES,
  type Balance, type Boat, type ChanceInput, type ChanceMod, type BriefingTopic, type CrewArchetype, type DebriefRule, type Dialogue, type Effect,
  type EventOption, type GameEvent, type Maneuver, type MapPoint, type Region, type SystemDef, type Route, type WeatherTemplate,
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
const SYSTEM_CONDITIONS = ['new', 'ok', 'worn'] as const;
const WEAR_SOURCES = ['motor_hour', 'sail_hour', 'night', 'anchoring'] as const;

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
  Prob,
  z.object({
    base: Prob,
    mods: z.array(ChanceModSchema).optional(),
    min: Prob.optional(),
    max: Prob.optional(),
  }).strict().refine((s) => (s.min ?? 0) <= (s.max ?? 1), { message: 'chance min must be <= max', path: ['min'] }),
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
  break: Id.optional(),
  wear: z.record(Id, z.number()).optional(),
  flag: Id.optional(),
  injury: z.boolean().optional(),
  signal: Id.optional(),
  promise: Id.optional(),
  xp: z.record(z.enum(TRAINABLE_VOICES), NonNeg).optional(),
}).strict();

const DefectSchema = z.object({
  id: Id, checkpoint: z.enum(CHECKPOINTS), description: Text, system: Id.optional(), chargedOnReturn: Id.optional(),
  fixEur: NonNeg.optional(), fixMin: NonNeg.optional(),
}).strict().refine((d) => !d.system || (d.fixEur !== undefined && d.fixMin !== undefined), { message: 'a defect with a system needs fixEur and fixMin' });

export const BoatSchema: z.ZodType<Boat> = z.object({
  id: Id, name: Text, lengthFt: Pos, cabins: Int.positive(), berths: Int.positive(),
  waterTankL: Pos, fuelTankL: Pos, motorLph: Pos.optional(), serviceBankAh: Pos, serviceBanks: Int.positive(), starterSeparate: z.boolean(),
  solarW: NonNeg, electricToilet: z.boolean(),
  motorKn: Pos, hullSpeedKn: Pos, priceEur: NonNeg, depositEur: NonNeg,
  shinyFeatures: z.array(Text),
  weakness: Text,
  defectPool: z.array(DefectSchema),
  defectsPerWeek: z.tuple([z.number().int().min(0), z.number().int().min(0)]),
  systems: z.record(Id, z.enum(SYSTEM_CONDITIONS)),
}).strict()
  .refine((b) => b.defectsPerWeek[0] <= b.defectsPerWeek[1], { path: ['defectsPerWeek'], message: 'defectsPerWeek must be [min, max]' })
  .refine((b) => b.defectPool.length >= b.defectsPerWeek[1], { path: ['defectPool'], message: 'defectPool has fewer entries than defectsPerWeek[1]' })
  .refine((b) => new Set(b.defectPool.map((d) => d.id)).size === b.defectPool.length, { path: ['defectPool'], message: 'duplicate defect ids' })
  .refine((b) => b.defectPool.every((d) => !d.system || d.system in b.systems), { path: ['defectPool'], message: 'defect system is not fitted on the boat' });

export const MapPointSchema: z.ZodType<MapPoint> = z.object({
  id: Id, name: Text, kind: z.enum(POINT_KINDS), x: z.number(), y: z.number(),
  seabed: z.enum(SEABEDS), shelter: fullRecord(DIRS, Prob),
  priceEur: NonNeg, placesGoneHour: Hour.nullable(),
  services: z.object({ water: z.boolean(), fuel: z.boolean(), shorePower: z.boolean(), gas: z.boolean(), taverna: z.boolean(), beach: z.boolean() }).strict(),
  berths: z.array(z.object({ type: z.enum(BERTH_TYPES), headingDeg: z.number().min(0).max(360) }).strict()).min(1),
  marineroChance: Prob, tight: z.boolean().optional(),
}).strict().superRefine((p, ctx) => {
  const problem = pointBerthProblem(p);
  if (problem) ctx.addIssue({ code: 'custom', path: ['berths'], message: problem });
});

export const RouteSchema: z.ZodType<Route> = z.object({
  id: Id, from: Id, to: Id, distanceNm: Pos, kLocal: Pos, features: z.array(z.enum(FEATURES)),
}).strict();

export const RegionSchema: z.ZodType<Region> = z.object({
  id: Id, name: Text, map: z.array(MapPointSchema).min(2), routes: z.array(RouteSchema).min(1),
}).strict();

const WeatherJitterSchema = z.object({ dirSteps: Int.min(0), kn: NonNeg }).strict();

export const WeatherTemplateSchema: z.ZodType<WeatherTemplate> = z.object({
  id: Id, name: Text, afternoonFactor: Pos, jitter: WeatherJitterSchema.optional(),
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
  success: EffectSchema.optional(), fail: EffectSchema.optional(), effects: EffectSchema.optional(), xp: NonNeg.optional(),
}).strict().refine(
  (o) => (o.check && o.success && o.fail && !o.effects) || (!o.check && !o.success && !o.fail && o.effects),
  { message: 'option needs either check+success+fail or effects' },
);

export const GameEventSchema: z.ZodType<GameEvent> = z.object({
  id: Id, pillar: z.enum(PILLARS),
  trigger: z.object({ phase: z.enum(EVENT_PHASES), conditions: z.array(z.string().min(1)), chance: ChanceInputSchema, once: z.boolean().optional() }).strict(),
  scene: Id, text: Text,
  voices: z.array(z.object({ voice: z.enum(VOICES), min_level: Int.min(0), text: Text, when: z.string().min(1).optional() }).strict()),
  options: z.array(OptionSchema).min(2),
  debrief: Text,
}).strict();

export const ManeuverSchema: z.ZodType<Maneuver> = z.object({
  id: Id, kind: z.enum(MANEUVER_KINDS), berth: z.enum(BERTH_TYPES).optional(), title: Text,
  steps: z.array(z.object({ id: Id, text: Text, when: z.string().min(1).optional() }).strict()).min(2),
  errors: z.array(z.object({
    id: Id, when: z.string().min(1).optional(), wrongIf: z.object({ first: Id, then: Id }).strict(), effect: EffectSchema,
    injuryChance: Prob, mitigatedBy: z.string().min(1).optional(), xp: NonNeg.optional(), text: Text,
  }).strict()),
  injuryMods: z.array(ChanceModSchema).optional(),
}).strict();

export const DebriefRuleSchema: z.ZodType<DebriefRule> = z.object({
  id: Id, pillar: z.enum(PILLARS), decision: z.string().min(1), consequence: z.string().min(1),
  signal: z.string().min(1).optional(), priority: z.number(), text: Text,
}).strict();

const Pair = z.tuple([z.number(), z.number()]);
const Triple = z.tuple([z.number(), z.number(), z.number()]);

const Band = z.tuple([z.number(), z.number()]).refine(([lo, hi]) => lo <= hi, 'band needs lo <= hi');
export const BalanceSchema: z.ZodType<Balance> = z.object({
  start: z.object({ moneyEur: NonNeg, mood: NonNeg, fatigue: NonNeg, gasPct: NonNeg, serviceBankPct: NonNeg, starterBankPct: NonNeg, hour: Hour, crewSize: Int.positive() }).strict(),
  voices: z.object({ points: Int.positive(), maxLevel: Int.positive(), prideLevel: Int.min(0), crewVoiceLevel: Int.min(0), seaSenseSignalLevel: Int.min(0), seaSenseChanceLevel: Int.min(0), seaSenseTimingLevel: Int.min(0), economistDiscountPerLevel: NonNeg, mechanicExactLevel: Int.min(0), cautionRiskPerLevel: NonNeg, cautionTimePerLevel: NonNeg, orderRiskPerLevel: NonNeg, xpToLevel: z.array(Int.positive()).min(1), xpExempt: z.array(z.enum(VOICES)), checkXp: z.object({ successPerDifficulty: NonNeg, failBonus: NonNeg }).strict(), maneuverErrorXp: NonNeg, cleanManeuverXp: NonNeg }).strict()
    .refine((v) => v.xpToLevel.length >= v.maxLevel, { message: 'xpToLevel needs a threshold for every level up to maxLevel', path: ['xpToLevel'] }),
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
  situation: z.object({ calmKn: NonNeg }).strict(),
  berths: z.object({ sideToPriceFactor: Pos, ashoreTimeHours: NonNeg, ashoreAnchorFailMul: z.number().min(-1) }).strict(),
  weather: z.object({ frontAddKn: Pair, frontShiftSteps: Int, barometerDropHpa: NonNeg, afternoonFromHour: Hour, jitter: WeatherJitterSchema }).strict(),
  schedule: z.object({ days: Int.positive(), returnDeadlineHour: Hour, lateFeeEur: NonNeg }).strict(),
  rescue: z.object({ jumpStartEur: NonNeg, jumpStartDelayMin: NonNeg, moodPenalty: NonNeg, towEur: NonNeg, towHours: NonNeg, towMoodPenalty: NonNeg }).strict(),
  budget: z.object({ weekEur: Pos, okFactor: Pos }).strict(),
  safety: z.object({ mitigationFactor: Prob }).strict(),
  deposit: z.object({ damageCostEur: z.record(NonNeg), defaultDamageEur: NonNeg }).strict(),
  grading: z.object({ crewGoodMood: NonNeg, crewOkMood: NonNeg, boatOkLossEur: NonNeg }).strict(),
  drama: z.object({ pillarWeightByDay: z.record(z.record(z.enum(PILLARS), NonNeg)) }).strict(),
  simTargets: z.object({
    levelGain: z.object({ newbie: Band, expert: Band, careful: Band }).strict(),
    weekInjuryRate: z.object({ newbie: Band, expert: Band }).strict(),
    zeroFireAllow: z.array(z.string()),
    // Boat and system ids are checked against content.boats / content.systems in crossValidate.
    weakness: z.record(Id, z.object({ systems: z.array(Id), causes: z.array(z.string().min(1)) }).strict()),
    weaknessMinRate: Prob,
    careful: z.object({ minMeanScore: NonNeg, weekInjuryRate: Band }).strict(),
  }).strict(),
}).strict();

export const DeadAllowSchema = z.array(z.object({ ref: z.string().min(1), reason: z.string().min(1) }).strict());

const SystemFailureSchema = z.object({
  id: Id, phase: z.enum(EVENT_PHASES), when: z.string().min(1).optional(), chance: ChanceInputSchema,
  effect: EffectSchema.optional(), event: Id.optional(),
  xp: z.record(z.enum(VOICES), NonNeg).optional(),
}).strict();

const RepairOptionSchema = z.object({
  id: Id, label: Text,
  check: z.object({ voice: z.enum(VOICES), difficulty: Int.min(0).max(6) }).strict().optional(),
  costEur: NonNeg.optional(), timeHours: NonNeg.optional(), requires: z.string().min(1).optional(),
  restores: z.literal('ok').optional(),
}).strict();

export const SystemDefSchema: z.ZodType<SystemDef> = z.object({
  id: Id, name: Text, checkpoint: z.enum(CHECKPOINTS).optional(),
  wearPer: z.record(z.enum(WEAR_SOURCES), NonNeg).optional(),
  failures: z.array(SystemFailureSchema),
  brokenEffect: z.object({
    noMotor: z.boolean().optional(), noSail: z.boolean().optional(), noCharge: z.boolean().optional(), noCook: z.boolean().optional(),
    dailyEffect: EffectSchema.optional(), anchorEffect: EffectSchema.optional(),
  }).strict(),
  repairs: z.array(RepairOptionSchema),
  returnCostEur: NonNeg.optional(),
}).strict();
