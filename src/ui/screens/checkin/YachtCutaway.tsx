import type { CheckpointId } from '../../../engine';
import styles from './Checkin.module.css';

/** Hotspot positions on the 600×220 side cutaway, bow to the right. */
const SPOTS: Readonly<Record<CheckpointId, { x: number; y: number }>> = {
  anchor: { x: 540, y: 118 },
  sails: { x: 330, y: 40 },
  toilets: { x: 450, y: 150 },
  electrics: { x: 370, y: 152 },
  impeller: { x: 270, y: 168 },
  gas: { x: 120, y: 120 },
  damage_photos: { x: 200, y: 186 },
};

export interface YachtCutawayProps {
  checked: ReadonlySet<CheckpointId>;
  disabled: ReadonlySet<CheckpointId>;
  onToggle: (id: CheckpointId) => void;
  label: string;
}

/** Decorative and clickable; the accessible controls are the buttons next to it. */
export function YachtCutaway({ checked, disabled, onToggle, label }: YachtCutawayProps) {
  return (
    <svg className={styles.cutaway} viewBox="0 0 600 220" role="img" aria-label={label}>
      <path className={styles.hull} d="M40 130 L560 120 Q 520 200 420 205 L130 205 Q 60 200 40 130 Z" />
      <line className={styles.mast} x1="330" y1="10" x2="330" y2="125" />
      <path className={styles.sail} d="M334 18 L334 118 L470 118 Z" />
      <line className={styles.deck} x1="40" y1="130" x2="560" y2="120" />
      {(Object.keys(SPOTS) as CheckpointId[]).map((id) => (
        <g
          key={id}
          aria-hidden="true"
          className={styles.spot}
          data-checked={checked.has(id)}
          data-disabled={disabled.has(id)}
          onClick={() => !disabled.has(id) && onToggle(id)}
        >
          <circle cx={SPOTS[id].x} cy={SPOTS[id].y} r="13" />
          <circle className={styles.dot} cx={SPOTS[id].x} cy={SPOTS[id].y} r="4" />
        </g>
      ))}
    </svg>
  );
}
