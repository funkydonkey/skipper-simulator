import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const ENGINE = 'src/engine';
const ALLOWED = new Set(['rng.ts', 'chance.ts']);

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    if (d.isDirectory()) return tsFiles(path);
    return d.name.endsWith('.ts') ? [path] : [];
  });
}

describe('spec §4.5: every engine roll goes through a chance spec', () => {
  it('raw chance( appears only in rng.ts and chance.ts', () => {
    const offenders = tsFiles(ENGINE)
      .filter((f) => !ALLOWED.has(relative(ENGINE, f)))
      .filter((f) => /\bchance\(/.test(readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
