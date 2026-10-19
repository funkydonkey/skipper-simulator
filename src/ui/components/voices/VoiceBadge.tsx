import type { VoiceId } from '../../../engine';
import { VOICE_NAMES } from '../../i18n/glossary';
import { useLang } from '../../session/SessionContext';
import { VoiceIcon } from './icons';
import styles from './Voice.module.css';

/** ТЗ 4.2: Pride and Economist are false voices — styled apart so the player learns to doubt them. */
export const FALSE_VOICES: readonly VoiceId[] = ['pride', 'economist'];

export function VoiceBadge({ voice, level }: { voice: VoiceId; level?: number }) {
  const lang = useLang();
  return (
    <span className={styles.badge} data-voice={voice} data-false={FALSE_VOICES.includes(voice) ? 'true' : 'false'}>
      <VoiceIcon voice={voice} />
      <span className={styles.name}>{VOICE_NAMES[voice][lang]}</span>
      {level !== undefined && <span className={`${styles.level} mono`}>{level}</span>}
    </span>
  );
}
