import { useId, useState } from 'react';
import type { ChanceValue, VoiceId } from '../../engine';
import { useGame } from '../session/SessionContext';
import { chanceRows } from '../view/chance';
import styles from './ChanceBadge.module.css';

export interface ChanceBadgeProps {
  odds: ChanceValue;
  label?: string;
  /** Current voice levels, shown next to voice parts. Omit for past rolls (the logbook). */
  voices?: Readonly<Record<VoiceId, number>>;
  /** Id of the badge button, for aria-describedby on the control it qualifies. */
  id?: string;
}

/** A probability the player can read and tap to see where it comes from. */
export function ChanceBadge({ odds, label, voices, id }: ChanceBadgeProps) {
  const { lang } = useGame();
  const [open, setOpen] = useState(false);
  const listId = useId();
  const pct = `${Math.round(odds.value * 100)}%`;
  const rows = chanceRows(odds, lang, voices);
  return (
    <div className={styles.wrap}>
      <button type="button" id={id} className={`${styles.badge} mono`} aria-expanded={open} aria-controls={listId} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {label ? `${label} · ${pct}` : pct}
      </button>
      <ul id={listId} className={styles.parts} hidden={!open}>
        {rows.map((r) => <li key={r.key}>{r.text}</li>)}
      </ul>
    </div>
  );
}
