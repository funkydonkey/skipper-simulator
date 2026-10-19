/** Label size in SVG units (.label in ChartMap.module.css): ~14 px on screen at the ~0.6 scale of a phone or the capped desktop chart. */
export const LABEL_FONT_MAX = 24;
/** Caveat averages ~0.42 em per glyph; 0.5 em keeps the estimate on the safe side. */
const CHAR_EM = 0.5;
const GAP = 12;

export const estimateLabelWidth = (text: string): number => text.length * CHAR_EM * LABEL_FONT_MAX;

export interface LabelPlacement { x: number; anchor: 'start' | 'end' }

/** Label to the right of the symbol, or to the left when it would run past the chart's right edge. */
export function labelPlacement(text: string, pointX: number, chartWidth: number): LabelPlacement {
  return pointX + GAP + estimateLabelWidth(text) <= chartWidth ? { x: GAP, anchor: 'start' } : { x: -GAP, anchor: 'end' };
}
