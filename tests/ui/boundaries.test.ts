import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });
}

describe('module boundaries', () => {
  it('UI imports the engine only through src/engine/index.ts', () => {
    const offenders = files('src/ui').filter((f) => /from '(\.\.\/)+engine\/(?!index')/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('UI imports content only through src/content/parse.ts', () => {
    const offenders = files('src/ui').filter((f) => /from '(\.\.\/)+content\/(?!parse'|\w+\.json')/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('engine stays free of DOM, React and storage', () => {
    const banned = /from 'react|document\.|window\.|localStorage|Math\.random|new Date|Date\.now/;
    const offenders = files('src/engine').filter((f) => banned.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
