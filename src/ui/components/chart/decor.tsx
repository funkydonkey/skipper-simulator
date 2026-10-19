import { DIRS, type Dir8, type MapPoint } from '../../../engine';
import type { Projection } from '../../view/map';
import styles from './ChartMap.module.css';

const VERTICES = 10;
const STEP_DEG = 360 / DIRS.length;
const ISOBATHS = [1.25, 1.5];
const WIND_GRID_PX = 140;

/** FNV-1a: stable small hash so the same point always gets the same coastline. */
export function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Unit vector (SVG axes: x east, y down) towards the sheltered side, where the land is. */
export function landOffset(p: MapPoint): { dx: number; dy: number } {
  let dx = 0;
  let dy = 0;
  for (const d of DIRS) {
    const rad = (DIRS.indexOf(d) * STEP_DEG * Math.PI) / 180;
    dx += p.shelter[d] * Math.sin(rad);
    dy -= p.shelter[d] * Math.cos(rad);
  }
  const len = Math.hypot(dx, dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

export function islandPath(id: string, cx: number, cy: number, r: number): string {
  let seed = hashId(id);
  const rnd = (): number => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const pts = Array.from({ length: VERTICES }, (_, i) => {
    const a = (i / VERTICES) * Math.PI * 2;
    const k = 0.7 + rnd() * 0.6;
    return { x: cx + Math.cos(a) * r * k, y: cy + Math.sin(a) * r * k };
  });
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[VERTICES - 1]!, pts[0]!);
  const segs = pts.map((p, i) => { const m = mid(p, pts[(i + 1) % VERTICES]!); return `Q ${p.x.toFixed(1)} ${p.y.toFixed(1)} ${m.x.toFixed(1)} ${m.y.toFixed(1)}`; });
  return `M ${start.x.toFixed(1)} ${start.y.toFixed(1)} ${segs.join(' ')} Z`;
}

export function ChartDefs() {
  return (
    <defs>
      <filter id="paper" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" result="noise" />
        <feColorMatrix in="noise" type="saturate" values="0" result="grain" />
        <feComponentTransfer in="grain" result="faint"><feFuncA type="linear" slope="0.08" /></feComponentTransfer>
        <feBlend in="SourceGraphic" in2="faint" mode="multiply" />
      </filter>
      <filter id="hand">
        <feTurbulence type="turbulence" baseFrequency="0.03" numOctaves="2" seed="3" result="t" />
        <feDisplacementMap in="SourceGraphic" in2="t" scale="2.2" />
      </filter>
      <pattern id="waves" width="48" height="24" patternUnits="userSpaceOnUse">
        <path className={styles.wave} d="M0 12 Q 12 4 24 12 T 48 12" />
      </pattern>
    </defs>
  );
}

export function Coastlines({ points, proj, r }: { points: readonly MapPoint[]; proj: Projection; r: number }) {
  return (
    <g filter="url(#hand)">
      {points.map((p) => {
        const s = proj.toSvg(p);
        const o = landOffset(p);
        const cx = s.x + o.dx * r * 0.9;
        const cy = s.y + o.dy * r * 0.9;
        return (
          <g key={p.id} data-coast={p.id}>
            {ISOBATHS.map((k) => <path key={k} className={styles.isobath} d={islandPath(p.id, cx, cy, r * k)} />)}
            <path className={styles.land} d={islandPath(p.id, cx, cy, r)} />
          </g>
        );
      })}
    </g>
  );
}

export function WaterLayer({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  return (
    <g className={styles.water} pointerEvents="none" aria-hidden="true">
      <rect width={width} height={height} fill="url(#waves)">
        {animate && <animateTransform attributeName="transform" type="translate" from="0 0" to="48 0" dur="18s" repeatCount="indefinite" />}
      </rect>
    </g>
  );
}

export function Clouds({ width, height, animate }: { width: number; height: number; animate: boolean }) {
  const clouds = [{ y: 0.18, rx: 0.16, dur: 70 }, { y: 0.55, rx: 0.12, dur: 90 }, { y: 0.8, rx: 0.1, dur: 60 }];
  return (
    <g className={styles.clouds} pointerEvents="none" aria-hidden="true">
      {clouds.map((c, i) => (
        <ellipse key={i} cx={-width * c.rx} cy={height * c.y} rx={width * c.rx} ry={height * 0.05}>
          {animate && <animateTransform attributeName="transform" type="translate" from="0 0" to={`${width * (1 + 2 * c.rx)} 0`} dur={`${c.dur}s`} begin={`-${i * 20}s`} repeatCount="indefinite" />}
        </ellipse>
      ))}
    </g>
  );
}

export function WindField({ width, height, dir }: { width: number; height: number; dir: Dir8 }) {
  const rot = (DIRS.indexOf(dir) * STEP_DEG + 180) % 360;
  const cols = Math.ceil(width / WIND_GRID_PX);
  const rows = Math.ceil(height / WIND_GRID_PX);
  return (
    <g className={styles.windField} pointerEvents="none" aria-hidden="true">
      {Array.from({ length: cols * rows }, (_, i) => {
        const x = (i % cols) * WIND_GRID_PX + WIND_GRID_PX / 2;
        const y = Math.floor(i / cols) * WIND_GRID_PX + WIND_GRID_PX / 2;
        return <path key={i} data-wind-arrow="" transform={`translate(${x} ${y}) rotate(${rot})`} d="M0 -14 V12 M-4 6 L0 12 L4 6" />;
      })}
    </g>
  );
}
