import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string): Record<string, unknown> => JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
type WithTargets = { simTargets: Record<string, unknown> };
const withoutWeakness = (b: Record<string, unknown>) => {
  const { weakness: _weakness, ...targets } = (b as WithTargets).simTargets;
  return { ...b, simTargets: targets };
};

describe('tests/fixtures/balance.json', () => {
  it('mirrors content/core/balance.json except simTargets.weakness (fixture boat ids)', () => {
    expect(withoutWeakness(read('tests/fixtures/balance.json'))).toEqual(withoutWeakness(read('content/core/balance.json')));
  });
});
