import { describe, expect, it } from 'vitest';
import { content } from '../ui/fixtures';

const IDS = ['engine_cooling', 'heads', 'windlass', 'electrical', 'rig', 'gas', 'bow_thruster'];
const COMMON = ['engine_cooling', 'heads', 'windlass', 'electrical', 'rig', 'gas'];

describe('systems content', () => {
  it('has exactly the seven systems', () => {
    expect(content.systems.map((s) => s.id).sort()).toEqual([...IDS].sort());
  });

  it('every system has at least one repair, and every service repair restores ok behind a marina condition', () => {
    for (const s of content.systems) {
      expect(s.repairs.length, s.id).toBeGreaterThanOrEqual(1);
      for (const r of s.repairs.filter((x) => x.id === 'service')) {
        expect(r.restores, `${s.id}.service`).toBe('ok');
        expect(r.requires).toBe('at_marina || moored_berth');
      }
      for (const r of s.repairs.filter((x) => x.id === 'self')) expect(r.check, `${s.id}.self`).toBeDefined();
    }
  });

  it('boats list only known systems and the common six', () => {
    for (const b of content.boats) {
      expect(Object.keys(b.systems).every((id) => IDS.includes(id)), b.id).toBe(true);
      for (const id of COMMON) expect(b.systems[id], `${b.id}.${id}`).toBeDefined();
      expect(id_has(b.systems, 'bow_thruster'), b.id).toBe(b.id === 'aurora_45');
    }
  });

  it('boat profiles match the spec', () => {
    const by = (id: string) => content.boats.find((b) => b.id === id)!;
    expect(by('aurora_45').systems.bow_thruster).toBe('worn');
    expect(by('meltemi_40').systems.rig).toBe('worn');
    expect(Object.values(by('calypso_38').systems).every((v) => v === 'ok')).toBe(true);
  });
});

function id_has(o: object, k: string): boolean { return Object.prototype.hasOwnProperty.call(o, k); }
