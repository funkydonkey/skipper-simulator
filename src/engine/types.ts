// Core types shared by engine, content loader and (later) UI.
// FROZEN after Task 1 — changes go through the coordinator.

export type Lang = 'ru' | 'en';
export interface LocalizedText { ru: string; en: string }

export const PILLARS = ['weather', 'time', 'briefing', 'promises', 'safety', 'boat'] as const;
export type Pillar = (typeof PILLARS)[number];

export const VOICES = ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist', 'pride', 'crew_voice'] as const;
export type VoiceId = (typeof VOICES)[number];
/** ТЗ 4.2: 6 прокачиваемых. Гордость и Голос экипажа — фиксированный уровень из баланса. */
export const TRAINABLE_VOICES = ['sea_sense', 'caution', 'order', 'mechanic', 'diplomat', 'economist'] as const;
export type TrainableVoice = (typeof TRAINABLE_VOICES)[number];

export const DIRS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;
export type Dir8 = (typeof DIRS)[number];

export const CHECKPOINTS = ['anchor', 'impeller', 'gas', 'toilets', 'sails', 'electrics', 'damage_photos'] as const;
export type CheckpointId = (typeof CHECKPOINTS)[number];

export const MANEUVER_KINDS = ['departure', 'mooring', 'anchoring', 'anchor_up'] as const;
export type ManeuverKind = (typeof MANEUVER_KINDS)[number];

export type Phase = 'captain' | 'boat_select' | 'checkin' | 'defects' | 'briefing' | 'morning' | 'planning' | 'evening' | 'return' | 'debrief';
export type EventPhase = 'morning' | 'passage' | 'arrival' | 'evening';
export type PointKind = 'base' | 'marina' | 'bay' | 'quay';
export type Seabed = 'sand' | 'mud' | 'weed' | 'rock';
export type RouteFeature = 'strait' | 'cape' | 'gulf' | 'open';
export type CrewWish = 'beach' | 'taverna' | 'early_start' | 'sailing' | 'rest' | 'swim';
export type Activity = 'swim' | 'taverna' | 'beach';
export type ShowerDiscipline = 'strict' | 'normal' | 'loose';
export type PointOfSail = 'upwind' | 'reach' | 'run';
export type Grade = 'good' | 'ok' | 'bad';

// ---------- resources, effects, log ----------

export interface Resources {
  waterL: number;
  fuelL: number;
  serviceBankPct: number;
  starterBankPct: number;
  gasPct: number;
  moneyEur: number;
  mood: number;
  fatigue: number;
}

/** Keys are snake_case because they come verbatim from events.json (ТЗ 5.2). */
export interface Effect {
  mood?: number;
  fatigue?: number;
  money?: number;
  water?: number;
  fuel?: number;
  service_bank?: number;
  starter_bank?: number;
  gas?: number;
  time_hours?: number;
  mood_per_day?: number;
  damage?: string;
  /** Clears `broken` on a boat system (no-op when the boat lacks it). Does not touch `damages`. */
  repair?: string;
  /** Marks a boat system broken (no-op when the boat lacks it). */
  break?: SystemId;
  /** Adds wear to boat systems (ignores systems the boat lacks). */
  wear?: Record<SystemId, number>;
  flag?: string;
  injury?: boolean;
  /** Logs `signal:<id>` — a sign the player could have read. */
  signal?: string;
  /** Dialogue id: creates an expectation (handled by events flow, Task 12). */
  promise?: string;
  /** Extra voice XP, granted by `grantXp` (exempt voices and voices at max level are skipped). */
  xp?: Partial<Record<TrainableVoice, number>>;
}

/** `saved`: euros the economist took off a money spend; logged as a separate info entry. */
export interface Outcome { cause: string; pillar?: Pillar; effect: Effect; saved?: number }

export type LogKind = 'decision' | 'effect' | 'event' | 'signal' | 'info' | 'roll';
export interface LogEntry {
  day: number;
  clockMin: number;
  kind: LogKind;
  cause: string;
  pillar?: Pillar;
  delta?: Partial<Record<keyof Resources, number>>;
  data?: Record<string, string | number | boolean>;
  /** Chance of a `roll` entry, with its per-source breakdown. */
  odds?: ChanceValue;
}

// ---------- content ----------

export interface BoatDefect {
  id: string;
  checkpoint: CheckpointId;
  description: LocalizedText;
  /** Sets this system to 'worn' while the defect is unfixed. */
  system?: SystemId;
  /** Damage id charged at check-out if the defect stayed hidden (e.g. unrecorded scratch). */
  chargedOnReturn?: string;
  /** Fix at the charter base; both are required when `system` is set. */
  fixEur?: number;
  fixMin?: number;
}

export interface Boat {
  id: string;
  name: LocalizedText;
  lengthFt: number;
  cabins: number;
  berths: number;
  waterTankL: number;
  fuelTankL: number;
  serviceBankAh: number;
  serviceBanks: number;
  /** false = one shared bank: service drain also drains the starter. */
  starterSeparate: boolean;
  solarW: number;
  electricToilet: boolean;
  motorKn: number;
  hullSpeedKn: number;
  priceEur: number;
  depositEur: number;
  shinyFeatures: LocalizedText[];
  /** Defects that may turn up in a week; `defectsPerWeek` of them are drawn at `chooseBoat`. */
  defectPool: BoatDefect[];
  defectsPerWeek: [number, number];
  /** Initial condition of every system on this boat; a system absent here is not fitted. */
  systems: Record<SystemId, SystemCondition>;
}

export type SystemId = string;
export type SystemCondition = 'new' | 'ok' | 'worn';
export interface SystemState { state: SystemCondition; wear: number; broken: boolean }
export interface BrokenEffect {
  noMotor?: boolean; noSail?: boolean; noCharge?: boolean; noCook?: boolean;
  /** Applied each night while broken. */
  dailyEffect?: Effect;
  /** Applied on each anchoring / anchor_up maneuver while broken. */
  anchorEffect?: Effect;
}
export interface SystemFailure {
  id: string; phase: EventPhase; when?: string; chance: ChanceInput;
  /** Applied on failure, before any queued event. Usually { break: <system> }. */
  effect?: Effect;
  /** Existing event queued for the player's choice. */
  event?: string;
  xp?: Partial<Record<VoiceId, number>>;
}
export interface RepairOption {
  id: string; label: LocalizedText;
  check?: VoiceCheck; costEur?: number; timeHours?: number;
  /** Condition, e.g. 'at_marina || moored_berth'. */
  requires?: string;
  /** Service repairs restore state 'ok'; self repairs only clear `broken`. */
  restores?: 'ok';
}
export interface SystemDef {
  id: SystemId; name: LocalizedText; checkpoint?: CheckpointId;
  wearPer?: Partial<Record<'motor_hour' | 'sail_hour' | 'night' | 'anchoring', number>>;
  failures: SystemFailure[]; brokenEffect: BrokenEffect; repairs: RepairOption[];
}

export interface PointServices {
  water: boolean;
  fuel: boolean;
  shorePower: boolean;
  gas: boolean;
  taverna: boolean;
  beach: boolean;
}

export interface MapPoint {
  id: string;
  name: LocalizedText;
  kind: PointKind;
  /** Nautical miles; x grows east, y grows north. */
  x: number;
  y: number;
  seabed: Seabed;
  /** 0 = fully exposed to wind FROM this direction, 1 = fully sheltered. */
  shelter: Record<Dir8, number>;
  priceEur: number;
  /** Hour after which berths run out (refusal chance applies). null = never. */
  placesGoneHour: number | null;
  services: PointServices;
}

/** Routes are bidirectional. */
export interface Route {
  id: string;
  from: string;
  to: string;
  distanceNm: number;
  kLocal: number;
  features: RouteFeature[];
}

export interface WeatherDay {
  day: number;
  windKn: number;
  gustKn: number;
  dir: Dir8;
  frontChance: number;
  barometerHpa: number;
}

export interface WeatherTemplate {
  id: string;
  name: LocalizedText;
  /** Multiplier on forecast wind after balance.weather.afternoonFromHour. */
  afternoonFactor: number;
  days: WeatherDay[];
}

export interface CrewArchetype {
  id: string;
  name: LocalizedText;
  names: LocalizedText[];
  wishes: CrewWish[];
  seasickness: number;
  patience: number;
  promiseSensitivity: number;
}

export interface BriefingTopic { id: string; title: LocalizedText; description: LocalizedText }

export type ExpectationSpec =
  | { kind: 'depart_by'; hour: number }
  | { kind: 'arrive_at_kind'; pointKind: PointKind }
  | { kind: 'activity'; activity: Activity }
  | { kind: 'none' };
export type ActiveExpectationSpec = Exclude<ExpectationSpec, { kind: 'none' }>;

export type DialogueContext = 'briefing' | 'morning' | 'evening';
export interface Dialogue {
  id: string;
  contexts: DialogueContext[];
  said: LocalizedText;
  heard: LocalizedText;
  strength: number;
  expectation: ExpectationSpec;
}

export interface EventTrigger { phase: EventPhase; conditions: string[]; chance: ChanceInput; once?: boolean }
export interface VoiceLine { voice: VoiceId; min_level: number; text: LocalizedText; when?: string }
export interface VoiceCheck { voice: VoiceId; difficulty: number }
/** Either `check + success + fail`, or `effects`. Option[0] is the instinctive newbie choice. */
export interface EventOption {
  id: string;
  text: LocalizedText;
  requires?: string[];
  check?: VoiceCheck;
  success?: Effect;
  fail?: Effect;
  effects?: Effect;
  /** Overrides the default check XP (balance.voices.checkXp) for the checked voice. */
  xp?: number;
}
export interface GameEvent {
  id: string;
  pillar: Pillar;
  trigger: EventTrigger;
  scene: string;
  text: LocalizedText;
  voices: VoiceLine[];
  options: EventOption[];
  debrief: LocalizedText;
}

export interface ManeuverStep { id: string; text: LocalizedText }
export interface ManeuverError {
  id: string;
  /** Error fires if step `first` is placed before step `then`. */
  wrongIf: { first: string; then: string };
  effect: Effect;
  injuryChance: number;
  /** Flag (e.g. `briefing.loaded_lines`) that scales effect and injury chance by balance.safety.mitigationFactor. */
  mitigatedBy?: string;
  /** Overrides balance.voices.maneuverErrorXp for this error. */
  xp?: number;
  text: LocalizedText;
}
export interface Maneuver {
  id: string;
  kind: ManeuverKind;
  title: LocalizedText;
  /** Listed in the CORRECT order. UI shuffles. */
  steps: ManeuverStep[];
  errors: ManeuverError[];
  /** Extra mods on every error's injury chance (e.g. broken systems, a bow thruster). */
  injuryMods?: ChanceMod[];
}

export interface DebriefRule {
  id: string;
  pillar: Pillar;
  decision: string;
  consequence: string;
  signal?: string;
  priority: number;
  text: LocalizedText;
}

export interface Balance {
  start: { moneyEur: number; mood: number; fatigue: number; gasPct: number; serviceBankPct: number; starterBankPct: number; hour: number; crewSize: number };
  voices: { points: number; maxLevel: number; prideLevel: number; crewVoiceLevel: number; seaSenseSignalLevel: number; seaSenseChanceLevel: number; seaSenseTimingLevel: number; economistDiscountPerLevel: number; mechanicExactLevel: number; cautionRiskPerLevel: number; cautionTimePerLevel: number; orderRiskPerLevel: number; xpToLevel: number[]; xpExempt: VoiceId[]; checkXp: { success: number; fail: number }; maneuverErrorXp: number; cleanManeuverXp: number };
  water: { perPersonPerDayL: Record<ShowerDiscipline, number>; zeroMoodPenalty: number };
  fuel: { motorLph: number; priceEurPerL: number };
  electric: { fridgeAhPerDay: number; pumpsAhPerDay: number; electricToiletAhPerDay: number; plotterAhPerHour: number; autopilotAhPerHour: number; engineChargeAhPerHour: number; solarAhPerWattDay: number; starterStartPct: number; starterMinPct: number; zeroServiceMoodPenalty: number };
  gas: { pctPerDay: number; exchangeEur: number; exchangeBelowPct: number; noHotFoodMoodPenalty: number };
  mood: { restPerHour: number; restCapHours: number; swimStop: number; tavernaDinner: number; tavernaEurPerPerson: number; overpowerPerHour: number; marinaRefused: number; rollyNight: number; injury: number; nightArrival: number };
  fatigue: { passagePerHour: number; maneuverError: number; nightRecovery: number; rollyNightPenalty: number; rollyExposure: number; checkPenaltyPerPoint: number; nightArrival: number };
  sails: {
    reefThresholdKn: [number, number, number];
    partialGenoaBonusKn: number;
    breakChancePerKnOver: number;
    breakChanceMax: number;
    forcedReefMarginKn: number;
    reefUnderwayMin: number;
    reefUnderwayInjuryChance: number;
    fullPowerWindKn: number;
    minSailWindKn: number;
    drifterFactor: number;
    overpowerSpeedFactor: number;
    posFactor: Record<PointOfSail, number>;
    reefFactor: [number, number, number];
    partialGenoaFactor: number;
    detourDistanceFactor: number;
    motorUpwindPenaltyWindKn: number;
    motorUpwindFactor: number;
  };
  time: {
    earliestDepartureHour: number;
    lateDepartureHour: number;
    busyRouteNm: number;
    busyRouteLegs: number;
    maxSwimStops: number;
    departureMin: number;
    anchorMin: [number, number];
    anchorFailChance: [number, number];
    seabedFailFactor: Record<Seabed, number>;
    anchorWindPenaltyKn: number;
    anchorWindPenalty: number;
    anchorBriefedReduction: number;
    anchorMaxAttempts: number;
    marinaMooringMin: number;
    marinaLateRefusalChance: number;
    marinaWaitMin: number;
    swimStopMin: number;
    sunsetHour: number;
    tavernaCloseHour: number;
    nightAnchorPenalty: number;
  };
  promises: { keptPerStrength: number; brokenPerStrength: number; diplomatSofteningPerLevel: number };
  checks: { base: number; perLevel: number; min: number; max: number };
  checkin: { budgetMin: number; costMin: Record<CheckpointId, number> };
  briefing: { slots: number; maxDialogues: number };
  weather: { frontAddKn: [number, number]; frontShiftSteps: number; barometerDropHpa: number; afternoonFromHour: number };
  schedule: { days: number; returnDeadlineHour: number; lateFeeEur: number };
  rescue: { jumpStartEur: number; jumpStartDelayMin: number; moodPenalty: number };
  safety: { mitigationFactor: number };
  deposit: { damageCostEur: Record<string, number>; defaultDamageEur: number };
  grading: { crewGoodMood: number; crewOkMood: number; boatOkLossEur: number };
  drama: { pillarWeightByDay: Record<string, Partial<Record<Pillar, number>>> };
  simTargets: { levelGain: Record<'newbie' | 'expert', [number, number]>; weekInjuryRate: Record<'newbie' | 'expert', [number, number]>; zeroFireAllow: string[] };
}

/** Region pack header plus its world; Content exposes the header as `region` and the world as `map`/`routes`. */
export interface Region { id: string; name: LocalizedText; map: MapPoint[]; routes: Route[] }

export interface Content {
  region: { id: string; name: LocalizedText };
  boats: Boat[];
  systems: SystemDef[];
  map: MapPoint[];
  routes: Route[];
  weather: WeatherTemplate[];
  crew: CrewArchetype[];
  briefing: BriefingTopic[];
  events: GameEvent[];
  dialogues: Dialogue[];
  debrief: DebriefRule[];
  maneuvers: Maneuver[];
  balance: Balance;
}

// ---------- runtime state ----------

export interface CrewMember { id: string; archetypeId: string; name: LocalizedText }

export interface Expectation {
  id: string;
  dialogueId: string;
  spec: ActiveExpectationSpec;
  strength: number;
  createdDay: number;
  dueDay: number;
  status: 'open' | 'kept' | 'broken';
}

export interface DayWeather {
  day: number;
  forecastKn: number;
  forecastGustKn: number;
  forecastDir: Dir8;
  barometerHpa: number;
  front: boolean;
  frontAddKn: number;
  frontDir: Dir8;
  barometerTrendHpa: number;
  signalsVisible: boolean;
}

export interface LegPlan {
  routeId: string;
  mode: 'motor' | 'sail';
  reefs: 0 | 1 | 2;
  genoa: 'full' | 'partial';
  course: 'direct' | 'detour';
}

export interface DayPlan {
  departureHour: number;
  /** Empty = stay in place today. Legs must chain from the current location. */
  legs: LegPlan[];
  swimStops: number;
  shower: ShowerDiscipline;
  autopilot: boolean;
  /** Step-id order chosen by the player, per maneuver kind. Absent = correct order. */
  maneuverOrders?: Partial<Record<ManeuverKind, string[]>>;
}

export interface DayFacts {
  day: number;
  departureHour: number | null;
  arrivalHour: number | null;
  arrivalPointKind: PointKind | null;
  mooring: 'anchor' | 'berth' | null;
  activities: Activity[];
  motorHours: number;
  sailHours: number;
  autopilotHours: number;
  /** Strongest true wind (kn) over today's legs; 0 when not sailing. */
  maxWindKn: number;
  shower: ShowerDiscipline;
}

export interface GameState {
  version: 3;
  seed: number;
  rng: number;
  lang: Lang;
  phase: Phase;
  day: number;
  clockMin: number;
  weatherTemplateId: string;
  locationId: string;
  boatId: string | null;
  voices: Record<VoiceId, number>;
  voiceXp: Record<TrainableVoice, number>;
  resources: Resources;
  flags: Record<string, boolean>;
  damages: string[];
  /** Only the systems fitted on the boat; `{}` before `chooseBoat`. */
  systems: Record<SystemId, SystemState>;
  crew: CrewMember[];
  expectations: Expectation[];
  moodPerDay: number;
  injuries: number;
  log: LogEntry[];
  firedEvents: string[];
  eventQueue: string[];
  weather: DayWeather | null;
  dayFacts: DayFacts | null;
  returnedOnTime: boolean | null;
  /** Ids from the boat's defect pool present this week and not fixed (a fixed one is removed). */
  defects: string[];
  /** Set by `performCheckin` when a defect with a system was found; kept after `resolveDefects` for the record. */
  checkin: { found: string[]; fixed: string[]; minutesLeft: number } | null;
}

export const CHANCE_LABELS = ['base', 'difficulty', 'fatigue', 'mitigation', 'seabed', 'wind', 'night', 'briefing', 'late', 'drama', 'checkin', 'worn', 'thruster', 'broken', 'wear'] as const;
export type ChanceLabel = (typeof CHANCE_LABELS)[number];
/**
 * add: value += add * scale. mul: always a delta factor, value *= (1 + mul * scale); write deltas such as (weight - 1).
 * scale is ctx[per] (a numeric context key, e.g. 'voice.caution', 'fatigue'), or 1 without `per`.
 * All add mods apply before all mul mods. `if` gates the mod.
 */
export interface ChanceMod { if?: string; per?: string; add?: number; mul?: number; label?: ChanceLabel }
export interface ChanceSpec { base: number; mods?: ChanceMod[]; min?: number; max?: number }
export type ChanceInput = number | ChanceSpec;
/** source: a ChanceLabel, or the `per` key (e.g. 'voice.caution') when no label is given. */
/** One step of a chance. `add` parts move it by `delta`; `mul` parts scale it by `factor` (delta = value * (factor - 1)). Base and clamp have no kind. */
export interface ChancePart { source: string; delta: number; kind?: 'add' | 'mul'; factor?: number }
export interface ChanceValue { value: number; parts: ChancePart[] }
