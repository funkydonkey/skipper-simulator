import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import type { GameState } from '../../src/engine/types';
import { runWeek } from '../../src/sim/run';
import { expert, newbie } from '../../src/sim/strategies';

const FIXTURE = 'tests/fixtures/determinism.json';
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;

/** JSON with sorted object keys, so the hash does not depend on property creation order. */
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    const entries = Object.entries(v as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, x]) => `${JSON.stringify(k)}:${stableStringify(x)}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

function weekHash(s: GameState): string {
  const outcome = { resources: s.resources, damages: s.damages, injuries: s.injuries, firedEvents: s.firedEvents, rng: s.rng };
  return createHash('sha256').update(stableStringify(outcome)).digest('hex').slice(0, 16);
}

function snapshot(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const strategy of [newbie, expert]) {
    for (const seed of SEEDS) out[`${strategy.name}:${seed}`] = weekHash(runWeek(content, seed, strategy).state);
  }
  return out;
}

describe('seeded week determinism', () => {
  it('runWeek outcomes for seeds 1..20 match the committed snapshot', () => {
    const actual = snapshot();
    if (process.env.UPDATE_SNAPSHOT === '1') writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 2)}\n`);
    const expected = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, string>;
    expect(actual).toEqual(expected);
  });
});
