import type { Lang, LocalizedText } from '../../engine';

export type Dict<K extends string> = Readonly<Record<K, LocalizedText>>;
export type Vars = Readonly<Record<string, string | number>>;
export type TFn<K extends string> = (key: K, vars?: Vars) => string;

/** Identity helper that keeps literal keys: `const S = dict({ a: {...} })`. */
export const dict = <K extends string>(d: Dict<K>): Dict<K> => d;

const show = (v: string | number): string => (typeof v === 'number' ? String(v).replace('-', '−') : v);

/** `{name}` placeholders; unknown placeholders stay visible so a typo shows on screen. Negative numbers get the true minus. */
export function fmt(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? show(vars[k]!) : m));
}

export function makeT<K extends string>(d: Dict<K>, lang: Lang): TFn<K> {
  return (key, vars) => fmt(d[key][lang], vars);
}
