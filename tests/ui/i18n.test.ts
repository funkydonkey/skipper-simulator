import { describe, expect, it } from 'vitest';
import type { LocalizedText } from '../../src/engine';
import { fmt, makeT } from '../../src/ui/i18n/t';

type AnyDict = Record<string, LocalizedText | Record<string, LocalizedText>>;
const modules = import.meta.glob<Record<string, unknown>>(
  ['../../src/ui/**/strings.ts', '../../src/ui/i18n/common.ts', '../../src/ui/i18n/glossary.ts'],
  { eager: true },
);

const isText = (v: unknown): v is LocalizedText =>
  typeof v === 'object' && v !== null && 'ru' in v && 'en' in v;

function* texts(value: unknown, path: string): Generator<[string, LocalizedText]> {
  if (isText(value)) { yield [path, value]; return; }
  if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) yield* texts(v, `${path}.${k}`);
  }
}

describe('i18n', () => {
  it('every UI string has non-empty ru and en', () => {
    const problems: string[] = [];
    let count = 0;
    for (const [file, mod] of Object.entries(modules)) {
      for (const [name, value] of Object.entries(mod as AnyDict)) {
        if (typeof value !== 'object') continue;
        for (const [path, t] of texts(value, `${file}:${name}`)) {
          count++;
          if (!t.ru.trim() || !t.en.trim()) problems.push(path);
          const ruVars = (t.ru.match(/\{\w+\}/g) ?? []).sort().join();
          const enVars = (t.en.match(/\{\w+\}/g) ?? []).sort().join();
          if (ruVars !== enVars) problems.push(`${path}: placeholders differ (${ruVars} vs ${enVars})`);
        }
      }
    }
    expect(count).toBeGreaterThan(20);
    expect(problems).toEqual([]);
  });

  it('fmt fills placeholders and keeps unknown ones visible', () => {
    expect(fmt('День {n} из {total}', { n: 2, total: 6 })).toBe('День 2 из 6');
    expect(fmt('Hi {who}', {})).toBe('Hi {who}');
  });

  it('makeT picks the language', () => {
    const t = makeT({ hello: { ru: 'Привет, {name}', en: 'Hello, {name}' } }, 'en');
    expect(t('hello', { name: 'Max' })).toBe('Hello, Max');
  });
});
