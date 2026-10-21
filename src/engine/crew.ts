import { seedHash } from './seed';
import type { Content, CrewMember, GameState, LocalizedText } from './types';

/** The crew for a seed. Archetype and name come from `seedHash` only: no `state.rng` draws, names are unique. */
export function makeCrew(content: Content, size: number, seed: number): CrewMember[] {
  const n = content.crew.length;
  const taken = new Map<string, Set<number>>();
  return Array.from({ length: size }, (_, i) => {
    const a = content.crew[seedHash(seed, 'crew', i) % n]!;
    const used = taken.get(a.id) ?? new Set<number>();
    const start = seedHash(seed, 'name', i) % a.names.length;
    const offset = Array.from({ length: a.names.length }, (_, k) => (start + k) % a.names.length).find((idx) => !used.has(idx)) ?? start;
    taken.set(a.id, new Set([...used, offset]));
    return { id: `crew_${i + 1}`, archetypeId: a.id, name: a.names[offset]! };
  });
}

/** What the renderer reads; the logbook has these without a whole `GameState`. */
export type CrewView = Pick<GameState, 'seed' | 'crew' | 'lang'>;

/** The placeholders content may use: `{crew.any}` and `{crew.role:<role>}` (names are nominative only). */
export const CREW_PLACEHOLDER = /\{crew\.(any|role:([a-z_]+))\}/;

/**
 * Replaces crew placeholders. One `key` (`<eventId>:<day>`) always picks the same person for the same
 * placeholder kind; a role with nobody aboard falls back to `{crew.any}`. Never touches `state.rng`.
 */
export function renderText(text: string, state: CrewView, content: Content, key: string): string {
  if (state.crew.length === 0) return text;
  const pick = (pool: CrewMember[]): string => pool[seedHash(state.seed, key) % pool.length]!.name[state.lang];
  return text.replace(new RegExp(CREW_PLACEHOLDER.source, 'g'), (_m, which: string, role: string | undefined) => {
    if (which === 'any') return pick(state.crew);
    const ids = new Set(content.crew.filter((a) => a.role === role).map((a) => a.id));
    const pool = state.crew.filter((m) => ids.has(m.archetypeId));
    return pick(pool.length ? pool : state.crew);
  });
}

/** Both languages of a localized text, rendered with the same key. */
export function renderLocalized(text: LocalizedText, state: CrewView, content: Content, key: string): LocalizedText {
  return { ru: renderText(text.ru, { ...state, lang: 'ru' }, content, key), en: renderText(text.en, { ...state, lang: 'en' }, content, key) };
}
