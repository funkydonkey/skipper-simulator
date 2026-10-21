import type { BerthType, ManeuverKind } from '../../../engine';
import styles from './Maneuvers.module.css';

type Shape = 'stern_to' | 'side_to' | 'anchor' | 'anchor_ashore';

/** The maneuver's own berth if it has one; else stern-to for the quay kinds, anchor for the others. */
function shapeOf(kind: ManeuverKind, berth: BerthType | undefined): Shape {
  if (berth) return berth;
  return kind === 'departure' || kind === 'mooring' ? 'stern_to' : 'anchor';
}

const WATER = 'M0 60 Q 20 55 40 60 T 80 60 T 120 60 T 160 60 V80 H0 Z';

function Drawing({ shape }: { shape: Shape }) {
  switch (shape) {
    case 'stern_to':
      return (
        <>
          <rect className={styles.quay} x="0" y="10" width="160" height="12" />
          <path className={styles.hull} d="M70 22 L90 22 L94 52 Q80 66 66 52 Z" />
          <line className={styles.line} x1="72" y1="24" x2="58" y2="14" />
          <line className={styles.line} x1="88" y1="24" x2="102" y2="14" />
        </>
      );
    case 'side_to':
      return (
        <>
          <rect className={styles.quay} x="0" y="10" width="160" height="12" />
          <path className={styles.hull} d="M44 24 L104 24 Q124 31 104 38 L44 38 Z" />
          <line className={styles.line} x1="46" y1="25" x2="34" y2="16" />
          <line className={styles.line} x1="106" y1="25" x2="120" y2="16" />
          <line className={styles.line} x1="96" y1="25" x2="70" y2="16" />
        </>
      );
    case 'anchor':
      return (
        <>
          <path className={styles.hull} d="M40 40 L100 34 Q118 40 100 48 L40 44 Z" />
          <line className={styles.line} x1="104" y1="40" x2="140" y2="70" />
          <path className={styles.anchor} d="M140 62 V74 M134 70 Q140 78 146 70" />
        </>
      );
    case 'anchor_ashore':
      return (
        <>
          <path className={styles.quay} d="M0 0 H34 Q26 30 18 50 Q10 64 0 70 Z" />
          <path className={styles.hull} d="M52 36 L104 32 Q122 38 104 46 L52 42 Z" />
          <line className={styles.line} x1="52" y1="39" x2="24" y2="34" />
          <line className={styles.line} x1="108" y1="40" x2="140" y2="70" />
          <path className={styles.anchor} d="M140 62 V74 M134 70 Q140 78 146 70" />
        </>
      );
  }
}

/** A small schematic per maneuver: quay with a boat stern-to or alongside, boat at anchor, or anchor and a line ashore. Decorative. */
export function ManeuverSketch({ kind, berth }: { kind: ManeuverKind; berth?: BerthType }) {
  const shape = shapeOf(kind, berth);
  return (
    <svg className={styles.sketch} viewBox="0 0 160 80" aria-hidden="true" data-sketch={shape}>
      <path className={styles.water} d={WATER} />
      <Drawing shape={shape} />
    </svg>
  );
}
