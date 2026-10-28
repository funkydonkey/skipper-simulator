import { z } from 'zod';
import { BERTH_TYPES, DIRS, PILLARS, TRAINABLE_VOICES, WIND_SIDES } from '../../engine';
import type { Content, GameState, Lang } from '../../engine';

export const SAVE_KEY = 'skipper.save.v2';
/** GameState.version this build reads; any other stored version is dropped as legacy. */
const SAVE_VERSION = 4;
/** Older formats are not migrated: readSave always drops them and reports 'legacy' once when no current slot exists. */
export const LEGACY_SAVE_KEYS: readonly string[] = ['skipper.save.v1'];
export const LANG_KEY = 'skipper.lang';

const PHASES = ['captain', 'boat_select', 'checkin', 'defects', 'briefing', 'morning', 'planning', 'evening', 'return', 'debrief'] as const;
const num = z.number().finite();
const text = z.object({ ru: z.string(), en: z.string() });
const POINT_KINDS = ['base', 'marina', 'bay', 'quay'] as const;
const ACTIVITIES = ['swim', 'taverna', 'beach'] as const;
const LOG_KINDS = ['decision', 'effect', 'event', 'signal', 'info', 'roll'] as const;

const ExpectationSchema = z.object({
  id: z.string(), dialogueId: z.string(),
  spec: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('depart_by'), hour: num }),
    z.object({ kind: z.literal('arrive_at_kind'), pointKind: z.enum(POINT_KINDS) }),
    z.object({ kind: z.literal('activity'), activity: z.enum(ACTIVITIES) }),
  ]),
  strength: num, createdDay: num, dueDay: num, status: z.enum(['open', 'kept', 'broken']),
});

const DayWeatherSchema = z.object({
  day: num, forecastKn: num, forecastGustKn: num, forecastDir: z.enum(DIRS), barometerHpa: num,
  front: z.boolean(), frontAddKn: num, frontDir: z.enum(DIRS), barometerTrendHpa: num, signalsVisible: z.boolean(),
});

const DayFactsSchema = z.object({
  day: num, departureHour: num.nullable(), arrivalHour: num.nullable(), arrivalPointKind: z.enum(POINT_KINDS).nullable(),
  mooring: z.enum(['anchor', 'berth']).nullable(), activities: z.array(z.enum(ACTIVITIES)),
  motorHours: num, sailHours: num, autopilotHours: num, maxWindKn: num, shower: z.enum(['strict', 'normal', 'loose']),
});

const OddsSchema = z.object({
  value: num,
  parts: z.array(z.object({ source: z.string(), delta: num, kind: z.enum(['add', 'mul']).optional(), factor: num.optional() })),
});

const SituationSchema = z.object({
  berth: z.enum(BERTH_TYPES), windSide: z.enum(WIND_SIDES), windKn: num, windDir: z.enum(DIRS),
  marinero: z.boolean(), marineroOdds: OddsSchema.nullable(),
  seabed: z.enum(['sand', 'mud', 'weed', 'rock']), tight: z.boolean(), source: z.enum(['forecast', 'fact']),
}).strict();

const LogEntrySchema = z.object({
  day: num, clockMin: num, kind: z.enum(LOG_KINDS), cause: z.string(),
  pillar: z.enum(PILLARS).optional(),
  odds: OddsSchema.optional(),
}).passthrough();

/** Shape check of a stored game. Deep engine invariants are trusted: the slot is written only by writeSave. */
const SlotSchema = z.object({
  savedAt: z.string(),
  game: z.object({
    version: z.literal(SAVE_VERSION),
    seed: num, rng: num, lang: z.enum(['ru', 'en']), phase: z.enum(PHASES), day: z.number().int().min(0), clockMin: num,
    weatherTemplateId: z.string(), locationId: z.string(), boatId: z.string().nullable(),
    voices: z.record(num),
    voiceXp: z.object(Object.fromEntries(TRAINABLE_VOICES.map((v) => [v, num])) as Record<(typeof TRAINABLE_VOICES)[number], typeof num>),
    resources: z.object({ waterL: num, fuelL: num, serviceBankPct: num, starterBankPct: num, gasPct: num, moneyEur: num, mood: num, fatigue: num }),
    flags: z.record(z.boolean()), damages: z.array(z.string()),
    systems: z.record(z.object({ state: z.enum(['new', 'ok', 'worn']), wear: num.min(0), broken: z.boolean() }).strict()),
    crew: z.array(z.object({ id: z.string(), archetypeId: z.string(), name: text })),
    expectations: z.array(ExpectationSchema), moodPerDay: num, injuries: num,
    log: z.array(LogEntrySchema),
    firedEvents: z.array(z.string()), eventQueue: z.array(z.string()),
    weather: DayWeatherSchema.nullable(), dayFacts: DayFactsSchema.nullable(), returnedOnTime: z.boolean().nullable(),
    defects: z.array(z.string()), startBalanceEur: num,
    situation: SituationSchema.nullable(),
    // Added within save v4: a slot written before it reads as a berth night.
    anchoredOff: z.boolean().default(false),
    checkin: z.object({ found: z.array(z.string()), fixed: z.array(z.string()), minutesLeft: num }).strict().nullable(),
  }).passthrough().refine((g) => g.phase !== 'defects' || g.checkin !== null, { message: 'phase defects needs a check-in', path: ['checkin'] }),
});

export type SaveRead = { kind: 'none' } | { kind: 'corrupt' } | { kind: 'legacy' } | { kind: 'ok'; savedAt: string; game: GameState };

function refsExist(g: GameState, c: Content): boolean {
  return c.map.some((p) => p.id === g.locationId)
    && (g.boatId === null || c.boats.some((b) => b.id === g.boatId))
    && c.weather.some((t) => t.id === g.weatherTemplateId)
    && g.eventQueue.every((id) => c.events.some((e) => e.id === id));
}

function safeGet(storage: Storage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

function safeSet(storage: Storage | null, key: string, value: string): boolean {
  if (!storage) return false;
  try { storage.setItem(key, value); return true; } catch { return false; }
}

function takeLegacy(storage: Storage | null): boolean {
  const found = LEGACY_SAVE_KEYS.filter((k) => safeGet(storage, k) !== null);
  found.forEach((k) => { try { storage?.removeItem(k); } catch { /* storage unavailable */ } });
  return found.length > 0;
}

function storedVersion(json: unknown): unknown {
  const game = typeof json === 'object' && json !== null ? (json as { game?: unknown }).game : undefined;
  return typeof game === 'object' && game !== null ? (game as { version?: unknown }).version : undefined;
}

export function readSave(storage: Storage | null, content: Content): SaveRead {
  const raw = safeGet(storage, SAVE_KEY);
  const hadLegacy = takeLegacy(storage);
  if (raw === null) return hadLegacy ? { kind: 'legacy' } : { kind: 'none' };
  try {
    const json: unknown = JSON.parse(raw);
    if (storedVersion(json) !== SAVE_VERSION) {
      clearSave(storage);
      return { kind: 'legacy' };
    }
    const parsed = SlotSchema.safeParse(json);
    if (!parsed.success) return { kind: 'corrupt' };
    const game = parsed.data.game as unknown as GameState;
    return refsExist(game, content) ? { kind: 'ok', savedAt: parsed.data.savedAt, game } : { kind: 'corrupt' };
  } catch {
    return { kind: 'corrupt' };
  }
}

export function writeSave(storage: Storage | null, game: GameState, now: Date): boolean {
  return safeSet(storage, SAVE_KEY, JSON.stringify({ savedAt: now.toISOString(), game }));
}

export function clearSave(storage: Storage | null): void {
  try { storage?.removeItem(SAVE_KEY); } catch { /* storage unavailable: nothing to clear */ }
}

export function readLangPref(storage: Storage | null): Lang | null {
  const v = safeGet(storage, LANG_KEY);
  return v === 'ru' || v === 'en' ? v : null;
}

export function writeLangPref(storage: Storage | null, lang: Lang): void {
  safeSet(storage, LANG_KEY, lang);
}

/** ТЗ 7.1: one slot, autosaved at the start of each day (morning, no pending event). */
export function shouldAutosave(prev: GameState | null, next: GameState | null): boolean {
  if (!next || next.phase !== 'morning' || next.eventQueue.length > 0) return false;
  return !prev || prev.phase !== 'morning' || prev.day !== next.day;
}

export function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    clear: () => m.clear(),
    getItem: (k: string) => m.get(k) ?? null,
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => { m.delete(k); },
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
  };
}

/** localStorage if it works (it can throw in private mode), otherwise null. */
export function browserStorage(): Storage | null {
  try {
    const s = window.localStorage;
    s.setItem('__probe', '1');
    s.removeItem('__probe');
    return s;
  } catch {
    return null;
  }
}
