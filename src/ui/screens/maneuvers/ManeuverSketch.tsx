import type { ManeuverKind } from '../../../engine';
import styles from './Maneuvers.module.css';

/** A small schematic per maneuver kind: quay and boat stern-to, or boat and anchor. Decorative. */
export function ManeuverSketch({ kind }: { kind: ManeuverKind }) {
  const atQuay = kind === 'departure' || kind === 'mooring';
  return (
    <svg className={styles.sketch} viewBox="0 0 160 80" aria-hidden="true">
      <path className={styles.water} d="M0 60 Q 20 55 40 60 T 80 60 T 120 60 T 160 60 V80 H0 Z" />
      {atQuay ? (
        <>
          <rect className={styles.quay} x="0" y="10" width="160" height="12" />
          <path className={styles.hull} d="M70 22 L90 22 L94 52 Q80 66 66 52 Z" />
          <line className={styles.line} x1="72" y1="24" x2="58" y2="14" />
          <line className={styles.line} x1="88" y1="24" x2="102" y2="14" />
        </>
      ) : (
        <>
          <path className={styles.hull} d="M40 40 L100 34 Q118 40 100 48 L40 44 Z" />
          <line className={styles.line} x1="104" y1="40" x2="140" y2="70" />
          <path className={styles.anchor} d="M140 62 V74 M134 70 Q140 78 146 70" />
        </>
      )}
    </svg>
  );
}
