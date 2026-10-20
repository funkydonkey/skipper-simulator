import type { ChancePart, ChanceValue, Lang, VoiceId } from '../../engine';
import { VOICE_NAMES } from '../i18n/glossary';
import { fmt } from '../i18n/t';
import { CHANCE_PARTS, CHANCE_UI } from './strings';

const VOICE_PREFIX = 'voice.';
type Voices = Readonly<Record<VoiceId, number>>;

const isVoicePart = (source: string): boolean => source.startsWith(VOICE_PREFIX);

/** Human label of a breakdown part. With `voices`, a voice part carries its level («Порядок 2»). */
export function partLabel(source: string, lang: Lang, voices?: Voices): string {
  if (isVoicePart(source)) {
    const id = source.slice(VOICE_PREFIX.length) as VoiceId;
    const name = Object.hasOwn(VOICE_NAMES, id) ? VOICE_NAMES[id][lang] : undefined;
    if (!name) return CHANCE_PARTS.unknown[lang];
    return voices ? `${name} ${voices[id] ?? 0}` : name;
  }
  const known = Object.hasOwn(CHANCE_PARTS, source) ? (CHANCE_PARTS as Record<string, { ru: string; en: string }>)[source] : undefined;
  return (known ?? CHANCE_PARTS.unknown)[lang];
}

const sign = (pct: number): string => (pct > 0 ? '+' : '−');

/** Whole percent with a real minus sign; null when it rounds to zero. */
function wholePercent(pct: number): string | null {
  const whole = Math.round(pct);
  return whole === 0 ? null : `${sign(pct)}${Math.abs(whole)}%`;
}

/** Like wholePercent, but small values keep one decimal and zero reads «0%»: never hidden. */
function visiblePercent(pct: number, lang: Lang): string {
  const tenths = Math.round(pct * 10) / 10;
  if (tenths === 0) return '0%';
  return wholePercent(pct) ?? `${sign(pct)}${Math.abs(tenths).toFixed(1).replace('.', lang === 'ru' ? ',' : '.')}%`;
}

/**
 * A part as the player reads it: the base as a plain percent, add parts in points of chance,
 * mul parts as the relative change they make (the captain screen's «−16%»).
 * Null when it rounds to zero, except voice parts, which are always shown.
 */
export function formatPart(p: ChancePart, lang: Lang): string | null {
  if (p.source === 'base') return `${Math.round(p.delta * 100)}%`;
  const pct = p.kind === 'mul' && p.factor !== undefined ? (p.factor - 1) * 100 : p.delta * 100;
  return isVoicePart(p.source) ? visiblePercent(pct, lang) : wholePercent(pct);
}

export interface ChanceRow { key: string; text: string }

/** Breakdown lines of a chance. Pass `voices` only for a chance computed now: past rolls had other levels. */
export function chanceRows(odds: ChanceValue, lang: Lang, voices?: Voices): ChanceRow[] {
  return odds.parts.flatMap((p, i) => {
    const delta = formatPart(p, lang);
    return delta === null ? [] : [{ key: `${p.source}-${i}`, text: fmt(CHANCE_UI.entry[lang], { label: partLabel(p.source, lang, voices), delta }) }];
  });
}
