import { DIRS, type Dir8 } from '../../engine';
import { COMMON } from '../i18n/common';
import { useT } from '../session/SessionContext';
import styles from './WindRose.module.css';

const STEP_DEG = 360 / DIRS.length;

/** Wind is named for where it comes FROM; the arrow points where it blows TO (compass bearing, glyphs point north at 0°). */
export const downwindDeg = (dir: Dir8): number => (DIRS.indexOf(dir) * STEP_DEG + 180) % 360;

export interface WindRoseProps { dir: Dir8; kn: number; gustKn?: number; size?: number }

export function WindRose({ dir, kn, gustKn, size = 96 }: WindRoseProps) {
  const t = useT(COMMON);
  const speed = gustKn !== undefined ? `${t('knots', { n: kn })} (${gustKn})` : t('knots', { n: kn });
  const caption = `${dir} ${speed}`;
  return (
    <figure className={styles.rose}>
      <svg width={size} height={size} viewBox="-50 -50 100 100" role="img" aria-label={caption}>
        <circle className={styles.ring} r="44" />
        {DIRS.map((d, i) => (
          <line key={d} className={styles.tick} x1="0" y1="-44" x2="0" y2={i % 2 ? -38 : -34} transform={`rotate(${i * STEP_DEG})`} />
        ))}
        <text className={styles.north} y="-26" textAnchor="middle">N</text>
        <g transform={`rotate(${downwindDeg(dir)})`}>
          <line className={styles.shaft} x1="0" y1="30" x2="0" y2="-26" />
          <path className={styles.head} d="M0 -34 L-7 -20 L7 -20 Z" />
        </g>
      </svg>
      <figcaption className={`${styles.caption} mono`}>{caption}</figcaption>
    </figure>
  );
}
