import type { VoiceId } from '../../../engine';
import { FALSE_VOICES, VoiceBadge } from './VoiceBadge';
import styles from './Voice.module.css';

/** A voice speaking inside a scene, like a line of dialogue (ТЗ 6.1, «Сцена события»). */
export function VoiceLine({ voice, text }: { voice: VoiceId; text: string }) {
  return (
    <blockquote className={styles.line} data-voice={voice} data-false={FALSE_VOICES.includes(voice) ? 'true' : 'false'}>
      <VoiceBadge voice={voice} />
      <p className={styles.quote}>{text}</p>
    </blockquote>
  );
}
