import { z } from 'zod';
import type { Content, GameState, Lang } from '../../engine';

export const SAVE_KEY = 'skipper.save.v1';
export const LANG_KEY = 'skipper.lang';

const PHASES = ['captain', 'boat_select', 'checkin', 'briefing', 'morning', 'planning', 'evening', 'return', 'debrief'] as const;
const num = z.number().finite();
const text = z.object({ ru: z.string(), en: z.string() });

/** Shape check of a stored game. Deep engine invariants are trusted: the slot is written only by writeSave. */
const SlotSchema = z.object({
  savedAt: z.string(),
  game: z.object({
    version: z.literal(1),
    seed: num, rng: num, lang: z.enum(['ru', 'en']), phase: z.enum(PHASES), day: z.number().int().min(0), clockMin: num,
    weatherTemplateId: z.string(), locationId: z.string(), boatId: z.string().nullable(),
    voices: z.record(num),
    resources: z.object({ waterL: num, fuelL: num, serviceBankPct: num, starterBankPct: num, gasPct: num, moneyEur: num, mood: num, fatigue: num }),
    flags: z.record(z.boolean()), damages: z.array(z.string()),
    crew: z.array(z.object({ id: z.string(), archetypeId: z.string(), name: text })),
    expectations: z.array(z.unknown()), moodPerDay: num, injuries: num,
    log: z.array(z.object({ day: num, clockMin: num, kind: z.string(), cause: z.string() }).passthrough()),
    firedEvents: z.array(z.string()), eventQueue: z.array(z.string()),
    weather: z.unknown(), dayFacts: z.unknown(), returnedOnTime: z.boolean().nullable(),
  }).passthrough(),
});

export type SaveRead = { kind: 'none' } | { kind: 'corrupt' } | { kind: 'ok'; savedAt: string; game: GameState };

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

export function readSave(storage: Storage | null, content: Content): SaveRead {
  const raw = safeGet(storage, SAVE_KEY);
  if (raw === null) return { kind: 'none' };
  try {
    const parsed = SlotSchema.safeParse(JSON.parse(raw));
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
