import { describe, expect, it } from 'vitest';
import { parseContent } from '../../src/content/parse';
import { loadContentDir } from '../../src/content/load-node';
import { weaknessHit } from '../../src/sim/weakness';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';
import { toRaw } from '../fixtures/raw';
import type { LogEntry } from '../../src/engine/types';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const targets = loaded.content.balance.simTargets;
const entry = (cause: string): LogEntry => ({ kind: 'info', cause, day: 3, clockMin: 0 });

describe('weaknessHit', () => {
  const state = makeState({ log: [entry('zero:water:3')] });
  it('is true when a log cause starts with one of the boat causes', () => expect(weaknessHit(state, 'calypso_38', targets)).toBe(true));
  it('is false for a boat whose causes do not match', () => expect(weaknessHit(state, 'aurora_45', targets)).toBe(false));
  it('is false for an empty log and for an unknown boat', () => {
    expect(weaknessHit(makeState({ log: [] }), 'calypso_38', targets)).toBe(false);
    expect(weaknessHit(state, 'ghost', targets)).toBe(false);
  });
});

describe('simTargets.weakness schema', () => {
  const mutated = (f: (w: any) => void) => {
    const raw = toRaw(makeContent());
    f(raw.balance.simTargets.weakness);
    return parseContent(raw);
  };
  it('accepts the fixture', () => expect(parseContent(toRaw(makeContent())).errors).toEqual([]));
  it('rejects an unknown boat', () => expect(mutated((w) => { w.ghost_boat = { systems: ['rig'], causes: [] }; }).content).toBeNull());
  it('rejects an unknown system', () => expect(mutated((w) => { w.aurora_45.systems = ['sonar']; }).content).toBeNull());
});
