import type { ChancePart, Lang, VoiceId } from '../../engine';
import { VOICE_NAMES } from '../i18n/glossary';
import { CHANCE_PARTS } from './strings';

const VOICE_PREFIX = 'voice.';

/** Human label of a breakdown part. With `voices`, a voice part carries its level («Порядок 2»). */
export function partLabel(source: string, lang: Lang, voices?: Readonly<Record<VoiceId, number>>): string {
  if (source.startsWith(VOICE_PREFIX)) {
    const id = source.slice(VOICE_PREFIX.length) as VoiceId;
    const name = VOICE_NAMES[id]?.[lang];
    if (!name) return CHANCE_PARTS.unknown[lang];
    return voices ? `${name} ${voices[id] ?? 0}` : name;
  }
  const known = (CHANCE_PARTS as Record<string, { ru: string; en: string }>)[source];
  return (known ?? CHANCE_PARTS.unknown)[lang];
}

/** Percentage points with a real minus sign, e.g. `+15%`; null when it rounds to zero. */
export function formatPart(p: ChancePart): string | null {
  const pp = Math.round(p.delta * 100);
  if (pp === 0) return null;
  return `${pp > 0 ? '+' : '−'}${Math.abs(pp)}%`;
}
