import { describe, expect, it } from 'vitest';
import { findDeadContent } from '../../src/content/dead';
import { content } from '../ui/fixtures';

const FAILURES = content.systems.flatMap((s) => s.failures.map((f) => ({ system: s.id, ...f })));
const MIGRATED = ['impeller_overheat', 'toilet_clog', 'toilet_misuse', 'gas_smell', 'genoa_seam_rip', 'anchor_shackle_loose'];
const eventOf = (id: string) => content.events.find((e) => e.id === id);

describe('system failures content', () => {
  it('has the eight failures of the table', () => {
    expect(FAILURES.map((f) => f.id).sort()).toEqual([
      'alternator_fault', 'anchor_shackle_loose', 'gas_smell', 'genoa_seam_rip',
      'impeller_overheat', 'thruster_trip', 'toilet_clog', 'toilet_misuse',
    ]);
  });

  it('each failure event exists and shares the failure phase', () => {
    for (const f of FAILURES) {
      expect(f.event, f.id).toBeDefined();
      const ev = eventOf(f.event!);
      expect(ev, f.id).toBeDefined();
      expect(ev!.trigger.phase, f.id).toBe(f.phase);
    }
  });

  it('a torn genoa breaks the rig whichever option is chosen', () => {
    for (const o of eventOf('genoa_seam_rip')!.options) expect(o.effects?.break, o.id).toBe('rig');
  });

  it('migrated events no longer read defect flags', () => {
    for (const id of MIGRATED) {
      expect(eventOf(id)!.trigger.conditions.filter((c) => c.includes('defect.')), id).toEqual([]);
    }
  });

  it('debrief rules matching event:<id> still find their event', () => {
    const ids = content.debrief.flatMap((r) => (r.consequence.startsWith('event:') ? [r.consequence.slice('event:'.length)] : []));
    for (const id of ['gas_smell', 'toilet_clog', 'impeller_overheat', 'genoa_seam_rip']) expect(ids).toContain(id);
    for (const id of ids) expect(eventOf(id), id).toBeDefined();
  });

  it('dead content check passes with an empty allowlist', () => {
    expect(findDeadContent(content, [])).toEqual([]);
  });

  it('every defect-pool system has at least one failure', () => {
    const withFailures = new Set(content.systems.filter((s) => s.failures.length > 0).map((s) => s.id));
    for (const b of content.boats) {
      for (const d of b.defectPool) if (d.system) expect(withFailures.has(d.system), `${b.id}:${d.id}`).toBe(true);
    }
  });

  it('failures carry the shared wear and voice mods and clamps', () => {
    for (const f of FAILURES) {
      expect(typeof f.chance, f.id).toBe('object');
      const ch = f.chance as { mods?: Array<{ per?: string; add?: number }>; min?: number; max?: number };
      expect(ch.min, f.id).toBe(0.01);
      expect(ch.max, f.id).toBe(0.8);
      expect(ch.mods, f.id).toContainEqual({ per: 'voice.mechanic', add: -0.02 });
      expect(ch.mods, f.id).toContainEqual({ per: `system.${f.system}.wear`, add: 0.004, label: 'wear' });
    }
  });

  it('new events use the planned scenes and breaks', () => {
    expect(eventOf('alternator_fault')!.scene).toBe('engine_bay');
    expect(eventOf('thruster_trip')!.scene).toBe('marina_entrance');
    const moor = eventOf('thruster_trip')!.options.find((o) => o.id === 'moor_without')!;
    expect(moor.effects).toEqual({ break: 'bow_thruster', fatigue: 8 });
    const keep = eventOf('alternator_fault')!.options.find((o) => o.id === 'keep_going')!;
    expect(keep.effects).toEqual({ break: 'electrical', mood: -3 });
  });

  it('putting up with a broken head costs only the heads dailyEffect, not a second mood_per_day (R30)', () => {
    const heads = content.systems.find((d) => d.id === 'heads')!;
    expect(heads.brokenEffect.dailyEffect).toEqual({ mood: -8 });
    expect(eventOf('toilet_clog')!.options.find((o) => o.id === 'endure')!.effects).toEqual({ break: 'heads' });
    expect(eventOf('toilet_misuse')!.options.find((o) => o.id === 'close_it')!.effects).toEqual({ break: 'heads' });
  });

  it('Calypso water tank is 300 L', () => {
    expect(content.boats.find((b) => b.id === 'calypso_38')!.waterTankL).toBe(300);
  });
});
