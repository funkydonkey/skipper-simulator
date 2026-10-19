import type { KeyboardEvent } from 'react';
import type { Dir8, MapPoint } from '../../../engine';
import { useSession, useT } from '../../session/SessionContext';
import { mapBounds, projection, routeBetween } from '../../view/map';
import { useReducedMotion } from '../motion';
import { ChartDefs, Clouds, Coastlines, WaterLayer, WindField } from './decor';
import styles from './ChartMap.module.css';
import { labelPlacement } from './labels';
import { CHART, FEATURE_NAMES } from './strings';
import { BoatToken, PointSymbol } from './symbols';

const PX_PER_NM = 24;
const GRID_NM = 5;
const COAST_RADIUS_NM = 1.6;
const SAIL_SECONDS_PER_LEG = 2.5;
/** ~48 CSS px across on a 375 px phone, where the chart is drawn at ~0.6 scale. */
const HIT_RADIUS = 40;

export interface ChartMapProps {
  locationId: string;
  trail?: readonly string[];
  animateTrail?: boolean;
  reachableIds?: readonly string[];
  onPointClick?: (pointId: string) => void;
  /** Drives the faint wind field only; the wind rose lives in the forecast panel. */
  wind?: { dir: Dir8 } | null;
}

export function trailPath(points: readonly { x: number; y: number }[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${Math.round(p.x)} ${Math.round(p.y)}`).join(' ');
}

interface ChartPointProps { point: MapPoint; name: string; at: { x: number; y: number }; chartWidth: number; onPick?: (pointId: string) => void }

/** A map point; with `onPick` it is a keyboard-reachable button with a large invisible hit circle. */
function ChartPoint({ point, name, at, chartWidth, onPick }: ChartPointProps) {
  const label = labelPlacement(name, at.x, chartWidth);
  const press = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick?.(point.id); }
  };
  return (
    <g
      transform={`translate(${at.x} ${at.y})`}
      className={styles.point}
      data-kind={point.kind}
      data-reachable={!!onPick}
      {...(onPick ? { role: 'button', tabIndex: 0, 'aria-label': name, onClick: () => onPick(point.id), onKeyDown: press } : {})}
    >
      {onPick && <circle data-hit="" r={HIT_RADIUS} fill="transparent" pointerEvents="visible" />}
      {onPick && <circle className={styles.halo} r="16" />}
      <PointSymbol kind={point.kind} />
      <text className={styles.label} x={label.x} y="4" textAnchor={label.anchor}>{name}</text>
    </g>
  );
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

  return (
    <figure className={styles.chart}>
      <svg className={styles.svg} viewBox={`0 0 ${proj.width} ${proj.height}`} role="group" aria-label={t('title')}>
        <ChartDefs />
        <rect className={styles.paper} width={proj.width} height={proj.height} filter="url(#paper)" />
        <WaterLayer width={proj.width} height={proj.height} animate={!reduced} />
        {wind && <WindField width={proj.width} height={proj.height} dir={wind.dir} />}
        <Coastlines points={content.map} proj={proj} r={COAST_RADIUS_NM * PX_PER_NM} />
        <g className={styles.grid}>
          {Array.from({ length: Math.floor(proj.width / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`v${i}`} x1={i * GRID_NM * PX_PER_NM} y1={0} x2={i * GRID_NM * PX_PER_NM} y2={proj.height} />
          ))}
          {Array.from({ length: Math.floor(proj.height / (GRID_NM * PX_PER_NM)) + 1 }, (_, i) => (
            <line key={`h${i}`} x1={0} y1={i * GRID_NM * PX_PER_NM} x2={proj.width} y2={i * GRID_NM * PX_PER_NM} />
          ))}
        </g>
        <g filter="url(#hand)">
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
        </g>
        {content.map.map((p) => (
          <ChartPoint key={p.id} point={p} name={p.name[lang]} at={proj.toSvg(p)} chartWidth={proj.width} {...(reachableIds.includes(p.id) && onPointClick ? { onPick: onPointClick } : {})} />
        ))}
        {trailPoints.length > 1 && <path className={styles.trail} d={trailPath(trailPoints)} />}
        <Clouds width={proj.width} height={proj.height} animate={!reduced} />
        <g className={styles.boat} aria-label={t('you')} transform={animate ? undefined : `translate(${here.x} ${here.y - 14})`}>
          <BoatToken />
          {animate && <animateMotion dur={`${SAIL_SECONDS_PER_LEG * (trailPoints.length - 1)}s`} fill="freeze" path={trailPath(trailPoints.map((p) => ({ x: p.x, y: p.y - 14 })))} />}
        </g>
      </svg>
    </figure>
  );
}
