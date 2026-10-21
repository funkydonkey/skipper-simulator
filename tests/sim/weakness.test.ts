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
  it('counts a fault on a weak system as a hit, and a real break too', () => {
    expect(weaknessHit(makeState({ log: [entry('fault:rig:genoa_seam_rip')] }), 'meltemi_40', targets)).toBe(true);
    expect(weaknessHit(makeState({ log: [entry('break:rig')] }), 'meltemi_40', targets)).toBe(true);
    expect(weaknessHit(makeState({ log: [entry('fault:electrical:alternator_fault')] }), 'aurora_45', targets)).toBe(true);
    expect(weaknessHit(makeState({ log: [entry('fault:bow_thruster:thruster_trip')] }), 'aurora_45', targets)).toBe(true);
  });
  it('lists fault:<x> and break:<x> together for every weak system named in a system cause', () => {
    for (const [boat, w] of Object.entries(targets.weakness)) {
      const named = new Set(w.causes.filter((c) => /^(fault|break):/.test(c)).map((c) => c.split(':')[1]));
      for (const sys of named) expect(w.causes, `${boat}:${sys}`).toEqual(expect.arrayContaining([`fault:${sys}`, `break:${sys}`]));
      for (const sys of named) expect(w.systems, `${boat}:${sys}`).toContain(sys);
    }
  });
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
