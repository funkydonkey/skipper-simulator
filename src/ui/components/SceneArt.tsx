import { label, SCENE_TITLES } from '../i18n/glossary';
import { SCENE_IMAGES } from '../scenes/manifest';
import { useLang } from '../session/SessionContext';
import { useReducedMotion } from './motion';
import styles from './SceneArt.module.css';

export type SceneMood = 'day' | 'dusk' | 'night' | 'storm';

export function sceneMood(scene: string): SceneMood {
  if (/night/.test(scene)) return 'night';
  if (/sunset|dusk/.test(scene)) return 'dusk';
  if (/squall|spray|wind/.test(scene)) return 'storm';
  return 'day';
}

/** A painting if the manifest has one, otherwise a calm placeholder: sky, horizon, two lines of swell. */
export function SceneArt({ scene, className }: { scene: string; className?: string }) {
  const lang = useLang();
  const reduced = useReducedMotion();
  const mood = sceneMood(scene);
  const src = SCENE_IMAGES[scene];
  const title = label(SCENE_TITLES, scene, lang);
  return (
    <figure className={[styles.scene, className].filter(Boolean).join(' ')} data-scene={scene} data-mood={mood}>
      {src ? (
        <img className={styles.image} src={src} alt={title} />
      ) : (
        <svg className={styles.stub} viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" role="img" aria-label={title}>
          <rect className={styles.sky} width="400" height="150" />
          <circle className={styles.sun} cx="300" cy="95" r="22" />
          <rect className={styles.sea} y="150" width="400" height="90" />
          <path className={styles.swell} d="M0 172 Q 50 162 100 172 T 200 172 T 300 172 T 400 172" />
          <path className={styles.swell} d="M0 200 Q 50 190 100 200 T 200 200 T 300 200 T 400 200" />
          {mood === 'night' && (
            <g data-layer="stars" className={styles.stars}>
              {[[40, 30], [90, 60], [150, 25], [210, 50], [260, 20], [330, 45], [370, 70]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4" />)}
            </g>
          )}
          {mood === 'storm' && (
            <g data-layer="rain" className={styles.rain}>
              {Array.from({ length: 24 }, (_, i) => (
                <line key={i} x1={i * 17} y1={-10} x2={i * 17 - 18} y2={30}>
                  {!reduced && <animate attributeName="y1" values="-10;250" dur={`${0.6 + (i % 5) * 0.1}s`} repeatCount="indefinite" />}
                  {!reduced && <animate attributeName="y2" values="30;290" dur={`${0.6 + (i % 5) * 0.1}s`} repeatCount="indefinite" />}
                </line>
              ))}
            </g>
          )}
        </svg>
      )}
      <figcaption className={styles.caption}>{title}</figcaption>
    </figure>
  );
}
