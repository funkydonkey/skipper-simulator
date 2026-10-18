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

export type Phase = 'captain' | 'boat_select' | 'checkin' | 'briefing' | 'morning' | 'planning' | 'evening' | 'return' | 'debrief';
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
  repair?: string;
  flag?: string;
  injury?: boolean;
  /** Logs `signal:<id>` — a sign the player could have read. */
  signal?: string;
  /** Dialogue id: creates an expectation (handled by events flow, Task 12). */
  promise?: string;
}

export interface Outcome { cause: string; pillar?: Pillar; effect: Effect }

export type LogKind = 'decision' | 'effect' | 'event' | 'signal' | 'check' | 'info';
export interface LogEntry {
  day: number;
  clockMin: number;
  kind: LogKind;
  cause: string;
  pillar?: Pillar;
  delta?: Partial<Record<keyof Resources, number>>;
  data?: Record<string, string | number | boolean>;
}

// ---------- content ----------

export interface HiddenDefect {
  id: string;
  checkpoint: CheckpointId;
  description: LocalizedText;
  /** Damage id charged at check-out if the defect stayed hidden (e.g. unrecorded scratch). */
  chargedOnReturn?: string;
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
  generator: boolean;
  electricToilet: boolean;
  bowThruster: boolean;
  motorKn: number;
  hullSpeedKn: number;
  priceEur: number;
  depositEur: number;
  shinyFeatures: LocalizedText[];
  hiddenDefects: HiddenDefect[];
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
  depthM: number;
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

export interface EventTrigger { phase: EventPhase; conditions: string[]; chance: number; once?: boolean }
export interface VoiceLine { voice: VoiceId; min_level: number; text: LocalizedText }
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
  text: LocalizedText;
}
export interface Maneuver {
  id: string;
  kind: ManeuverKind;
  title: LocalizedText;
  /** Listed in the CORRECT order. UI shuffles. */
  steps: ManeuverStep[];
  errors: ManeuverError[];
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
  voices: { points: number; maxLevel: number; prideLevel: number; crewVoiceLevel: number; seaSenseSignalLevel: number; mechanicExactLevel: number; cautionRiskPerLevel: number; cautionTimePerLevel: number; orderRiskPerLevel: number };
  water: { perPersonPerDayL: Record<ShowerDiscipline, number>; zeroMoodPenalty: number };
  fuel: { motorLph: number; priceEurPerL: number };
  electric: { fridgeAhPerDay: number; pumpsAhPerDay: number; electricToiletAhPerDay: number; plotterAhPerHour: number; autopilotAhPerHour: number; engineChargeAhPerHour: number; solarAhPerWattDay: number; starterStartPct: number; starterMinPct: number; zeroServiceMoodPenalty: number };
  gas: { pctPerDay: number; exchangeEur: number; exchangeBelowPct: number; noHotFoodMoodPenalty: number };
  mood: { restPerHour: number; restCapHours: number; swimStop: number; tavernaDinner: number; tavernaEurPerPerson: number; overpowerPerHour: number; marinaRefused: number; rollyNight: number; injury: number };
  fatigue: { passagePerHour: number; maneuverError: number; nightRecovery: number; rollyNightPenalty: number; rollyExposure: number; checkPenaltyPerPoint: number };
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
}

export interface Content {
  boats: Boat[];
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
  shower: ShowerDiscipline;
}

export interface GameState {
  version: 1;
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
  resources: Resources;
  flags: Record<string, boolean>;
  damages: string[];
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
}
