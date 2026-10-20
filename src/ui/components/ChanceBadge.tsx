import { useId, useState } from 'react';
import type { ChanceValue } from '../../engine';
import { useGame, useT } from '../session/SessionContext';
import { formatPart, partLabel } from '../view/chance';
import { CHANCE_UI } from '../view/strings';
import styles from './ChanceBadge.module.css';

export interface ChanceBadgeProps { odds: ChanceValue; label?: string }

/** A probability the player can read and tap to see where it comes from. */
export function ChanceBadge({ odds, label }: ChanceBadgeProps) {
  const { game, lang } = useGame();
  const t = useT(CHANCE_UI);
  const [open, setOpen] = useState(false);
  const listId = useId();
  const pct = `${Math.round(odds.value * 100)}%`;
  const rows = odds.parts.flatMap((p) => {
    const delta = p.source === 'base' ? `${Math.round(p.delta * 100)}%` : formatPart(p);
    return delta === null ? [] : [{ key: p.source, text: t('entry', { label: partLabel(p.source, lang, game.voices), delta }) }];
  });
  return (
    <div className={styles.wrap}>
      <button type="button" className={`${styles.badge} mono`} aria-expanded={open} aria-controls={listId} onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}>
        {label ? `${label} · ${pct}` : pct}
      </button>
      <ul id={listId} className={styles.parts} hidden={!open} aria-label={t('partsList')}>
        {rows.map((r, i) => <li key={`${r.key}-${i}`}>{r.text}</li>)}
      </ul>
    </div>
  );
}
