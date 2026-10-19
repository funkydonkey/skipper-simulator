/** Where an SVG arrow head ends up after its `rotate(a)`: SVG axes, x east, y down. */
export function rotatedTip(transform: string, tip: { x: number; y: number }): { x: number; y: number } {
  const deg = Number(/rotate\((-?[\d.]+)\)/.exec(transform)?.[1] ?? 'NaN');
  const rad = (deg * Math.PI) / 180;
  return { x: tip.x * Math.cos(rad) - tip.y * Math.sin(rad), y: tip.x * Math.sin(rad) + tip.y * Math.cos(rad) };
}

const pairs = (d: string): Array<{ x: number; y: number }> =>
  [...d.matchAll(/[ML]\s*(-?[\d.]+)[ ,](-?[\d.]+)/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

/** Tip of a filled head drawn as `M tip L … Z`. */
export const headTip = (d: string) => pairs(d)[0]!;

/** Tip of a chevron head drawn as the last subpath `M a L tip L b`. */
export function chevronTip(d: string): { x: number; y: number } {
  const last = d.slice(d.lastIndexOf('M'));
  return pairs(last)[1]!;
}
