import type { Content, Lang, MapPoint, Route } from '../../engine';

export interface Bounds { minX: number; maxX: number; minY: number; maxY: number }
export interface Projection { width: number; height: number; toSvg(p: { x: number; y: number }): { x: number; y: number } }

export function mapBounds(points: readonly { x: number; y: number }[], padNm = 3): Bounds {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { minX: Math.min(...xs) - padNm, maxX: Math.max(...xs) + padNm, minY: Math.min(...ys) - padNm, maxY: Math.max(...ys) + padNm };
}

/** Nautical miles → SVG pixels, north up (map y grows north, SVG y grows down). */
export function projection(b: Bounds, pxPerNm = 24): Projection {
  return {
    width: (b.maxX - b.minX) * pxPerNm,
    height: (b.maxY - b.minY) * pxPerNm,
    toSvg: (p) => ({ x: (p.x - b.minX) * pxPerNm, y: (b.maxY - p.y) * pxPerNm }),
  };
}

export function routesFrom(content: Content, pointId: string): Array<{ route: Route; to: MapPoint }> {
  return content.routes.flatMap((route) => {
    const toId = route.from === pointId ? route.to : route.to === pointId ? route.from : null;
    const to = toId ? content.map.find((p) => p.id === toId) : undefined;
    return to ? [{ route, to }] : [];
  });
}

export function routeBetween(content: Content, a: string, b: string): Route | null {
  return content.routes.find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

export function pointName(content: Content, id: string, lang: Lang): string {
  return content.map.find((p) => p.id === id)?.name[lang] ?? id;
}
