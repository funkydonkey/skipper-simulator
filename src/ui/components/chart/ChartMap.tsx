import type { KeyboardEvent } from 'react';
import type { Dir8 } from '../../../engine';
import { useSession, useT } from '../../session/SessionContext';
import { mapBounds, projection, routeBetween } from '../../view/map';
import { useReducedMotion } from '../motion';
import { WindRose } from '../WindRose';
import styles from './ChartMap.module.css';
import { CHART, FEATURE_NAMES } from './strings';
import { BoatToken, PointSymbol } from './symbols';

const PX_PER_NM = 24;
const GRID_NM = 5;
const SAIL_SECONDS_PER_LEG = 2.5;

export interface ChartMapProps {
  locationId: string;
  trail?: readonly string[];
  animateTrail?: boolean;
  reachableIds?: readonly string[];
  onPointClick?: (pointId: string) => void;
  wind?: { dir: Dir8; kn: number; gustKn?: number } | null;
}

export function trailPath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
}

export function ChartMap({ locationId, trail = [], animateTrail = false, reachableIds = [], onPointClick, wind }: ChartMapProps) {
  const { session } = useSession();
  const { content, lang } = session;
  const t = useT(CHART);
  const reduced = useReducedMotion();
  const proj = projection(mapBounds(content.map), PX_PER_NM);
  const at = (id: string) => proj.toSvg(content.map.find((p) => p.id === id) ?? { x: 0, y: 0 });
  const lit = new Set(trail.slice(1).map((id, i) => routeBetween(content, trail[i]!, id)?.id).filter(Boolean));
  const trailPoints = trail.map(at);
  const here = at(locationId);
  const animate = animateTrail && !reduced && trailPoints.length > 1;
  const press = (id: string) => (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPointClick?.(id); }
  };

  return (
    <figure className={styles.chart}>
      <svg className={styles.svg} viewBox={`0 0 ${proj.width} ${proj.height}`} role="group" aria-label={t('title')}>
        <rect className={styles.paper} width={proj.width} height={proj.height} />
        <g className={styles.grid}>
          {Array.from({ length: Math.floor(proj.width / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * GRID_NM * PX_PER_NM} y1={0} x2={i * GRID_NM * PX_PER_NM} y2={proj.height} />
          ))}
          {Array.from({ length: Math.floor(proj.height / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * GRID_NM * PX_PER_NM} x2={proj.width} y2={i * GRID_NM * PX_PER_NM} />
          ))}
        </g>
        {content.routes.map((r) => {
          const a = at(r.from);
          const b = at(r.to);
          const special = r.features.find((f) => f !== 'open');
          return (
            <g key={r.id} data-route={r.id} data-highlight={lit.has(r.id) ? 'true' : 'false'} className={styles.route}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={special ? '6 5' : undefined} />
              {special && <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} className={styles.feature}>{FEATURE_NAMES[special][lang]}</text>}
            </g>
          );
        })}
        {content.map.map((p) => {
          const s = proj.toSvg(p);
          const clickable = reachableIds.includes(p.id);
          return (
            <g
              key={p.id}
              transform={`translate(${s.x} ${s.y})`}
              className={styles.point}
              data-kind={p.kind}
              data-reachable={clickable}
              {...(clickable ? { role: 'button', tabIndex: 0, 'aria-label': p.name[lang], onClick: () => onPointClick?.(p.id), onKeyDown: press(p.id) } : {})}
            >
              {clickable && <circle className={styles.halo} r="16" />}
              <PointSymbol kind={p.kind} />
              <text className={styles.label} x="12" y="4">{p.name[lang]}</text>
            </g>
          );
        })}
        {trailPoints.length > 1 && <path className={styles.trail} d={trailPath(trailPoints)} />}
        <g className={styles.boat} aria-label={t('you')} transform={animate ? undefined : `translate(${here.x} ${here.y - 14})`}>
          <BoatToken />
          {animate && <animateMotion dur={`${SAIL_SECONDS_PER_LEG * (trailPoints.length - 1)}s`} fill="freeze" path={trailPath(trailPoints.map((p) => ({ x: p.x, y: p.y - 14 })))} />}
        </g>
      </svg>
      {wind && <div className={styles.rose}><WindRose dir={wind.dir} kn={wind.kn} gustKn={wind.gustKn} size={80} /></div>}
    </figure>
  );
}
