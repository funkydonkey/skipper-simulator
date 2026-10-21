import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { evaluateCondition, type CondContext } from '../../src/engine/expr';
import { maneuverFor, stepsFor } from '../../src/engine/maneuver';
import { situationContext } from '../../src/engine/situation-context';
import type { BerthType, ManeuverKind, WindSide } from '../../src/engine/types';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const content = loaded.content;
const byId = (id: string) => content.maneuvers.find((m) => m.id === id)!;

const ctxOf = (side: WindSide, marinero: boolean, tight: boolean, seabed = 'sand'): CondContext => ({
  ...situationContext({ berth: 'stern_to', windSide: side, windKn: 12, windDir: 'NW', marinero, marineroOdds: null, seabed: seabed as never, tight, source: 'fact' }),
  'place.seabed': seabed,
});
const SIDES: WindSide[] = ['bow', 'port'];
const TF = [true, false];
const combos16 = SIDES.flatMap((side) => TF.flatMap((marinero) => TF.flatMap((tight) => ['sand', 'rock'].map((seabed) => ctxOf(side, marinero, tight, seabed)))));

describe('maneuver content (3c)', () => {
  it('has six maneuvers with one berth-less default per kind', () => {
    expect(content.maneuvers).toHaveLength(6);
    const kinds = new Set(content.maneuvers.map((m) => m.kind));
    for (const k of kinds) expect(content.maneuvers.filter((m) => m.kind === k && m.berth === undefined)).toHaveLength(1);
  });
  it('mooring_side_to and anchor_stern_ashore carry their berth', () => {
    expect(byId('mooring_side_to')).toMatchObject({ kind: 'mooring', berth: 'side_to' });
    expect(byId('anchor_stern_ashore')).toMatchObject({ kind: 'anchoring', berth: 'anchor_ashore' });
  });
  it('every berth resolves to an existing maneuver', () => {
    const pairs: [ManeuverKind, BerthType][] = [['mooring', 'stern_to'], ['mooring', 'side_to'], ['anchoring', 'anchor'], ['anchoring', 'anchor_ashore']];
    for (const [k, b] of pairs) expect(maneuverFor(content, k, b)).not.toBeNull();
    expect(maneuverFor(content, 'mooring', 'side_to')!.id).toBe('mooring_side_to');
    expect(maneuverFor(content, 'anchoring', 'anchor_ashore')!.id).toBe('anchor_stern_ashore');
  });
  it('mooring_med gives 8 distinct step sets over tight x side x marinero', () => {
    const m = byId('mooring_med');
    const sets = new Set<string>();
    for (const side of SIDES) for (const marinero of TF) for (const tight of TF) sets.add(stepsFor(m, ctxOf(side, marinero, tight)).map((s) => s.id).join(','));
    expect(sets.size).toBe(8);
  });
  it('every wrongIf id exists and every error `when` implies its steps` `when`', () => {
    for (const m of content.maneuvers) {
      const stepWhen = new Map(m.steps.map((s) => [s.id, s.when]));
      for (const e of m.errors) {
        for (const id of [e.wrongIf.first, e.wrongIf.then]) {
          expect(stepWhen.has(id), `${m.id}.${e.id} -> ${id}`).toBe(true);
          const w = stepWhen.get(id);
          if (w === undefined) continue;
          for (const ctx of combos16) {
            if (e.when === undefined || evaluateCondition(e.when, ctx)) expect(evaluateCondition(w, ctx), `${m.id}.${e.id} step ${id}`).toBe(true);
          }
        }
      }
    }
  });
  it('adds the conditional steps and errors at the right positions', () => {
    const med = byId('mooring_med').steps.map((s) => s.id);
    expect(med.indexOf('extra_fenders_neighbor')).toBe(med.indexOf('fenders_ready') + 1);
    expect(med.indexOf('windward_stern_first')).toBe(med.indexOf('brief_roles') + 1);
    expect(med.indexOf('pick_lazy_line_boathook')).toBe(med.indexOf('pick_mooring') - 1);
    const bay = byId('anchoring_bay').steps.map((s) => s.id);
    expect(bay.indexOf('test_holding_astern')).toBe(bay.indexOf('back_down') + 1);
    expect(byId('mooring_med').errors.map((e) => e.id)).toEqual(expect.arrayContaining(['tight_no_fenders', 'leeward_first', 'mooring_no_hook']));
    expect(byId('anchoring_bay').errors.map((e) => e.id)).toContain('test_before_drop');
  });
});
