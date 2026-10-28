import { describe, expect, it } from 'vitest';
import { applyDefects, pickDefects, resolveDefects } from '../../src/engine/defects';
import { finishWeek } from '../../src/engine/day/evening';
import { assignVoices, chooseBoat, newGame, performCheckin } from '../../src/engine/setup';
import { initialSystems } from '../../src/engine/systems';
import type { GameState } from '../../src/engine/types';
import { loadContentDir } from '../../src/content/load-node';
import { BoatSchema } from '../../src/content/schema';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';

const content = makeContent();
const boat = content.boats[0]!;
const alloc = { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 };
const atCheckin = (defects: string[]): GameState => {
  const s = chooseBoat(assignVoices(newGame(content, { seed: 7, lang: 'ru' }), content, alloc), content, 'test_boat');
  return deepFreeze({ ...s, defects, systems: applyDefects(initialSystems(boat), boat, defects) });
};

describe('pickDefects', () => {
  it('is deterministic per rng and returns 2 or 3 distinct pool ids', () => {
    expect(pickDefects(5, boat)).toEqual(pickDefects(5, boat));
    const counts = new Set<number>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = pickDefects(seed, boat);
      expect(new Set(r.value).size).toBe(r.value.length);
      expect(r.value.every((id) => boat.defectPool.some((d) => d.id === id))).toBe(true);
      expect([2, 3]).toContain(r.value.length);
      expect(r.next).not.toBe(seed);
      counts.add(r.value.length);
    }
    expect([...counts].sort()).toEqual([2, 3]);
  });
});

describe('boat schema', () => {
  it('rejects a pool smaller than defectsPerWeek[1]', async () => {
    const loaded = await loadContentDir('content');
    const real = loaded.content!.boats[0]!;
    expect(BoatSchema.safeParse(real).success).toBe(true);
    expect(BoatSchema.safeParse({ ...real, defectPool: real.defectPool.slice(0, 2) }).success).toBe(false);
  });
  it('requires fixEur and fixMin when a defect has a system', async () => {
    const real = (await loadContentDir('content')).content!.boats[0]!;
    const bad = real.defectPool.map((d) => (d.system ? { ...d, fixMin: undefined } : d));
    expect(BoatSchema.safeParse({ ...real, defectPool: bad }).success).toBe(false);
  });
});

describe('chooseBoat defects', () => {
  it('draws the week defects and wears their systems', () => {
    const s = chooseBoat(assignVoices(newGame(content, { seed: 7, lang: 'ru' }), content, alloc), content, 'test_boat');
    expect(s.defects.length).toBeGreaterThanOrEqual(2);
    expect(s.rng).not.toBe(7);
    for (const id of s.defects) {
      const sys = boat.defectPool.find((d) => d.id === id)!.system;
      if (sys) expect(s.systems[sys]!.state).toBe('worn');
    }
  });
  it('applyDefects keeps an already worn system worn and ignores systems the boat lacks', () => {
    const base = initialSystems(boat);
    const worn = applyDefects(base, { ...boat, defectPool: [{ ...boat.defectPool[0]!, id: 'x', system: 'bow_thruster' }, { ...boat.defectPool[0]!, id: 'y', system: 'gas' }] }, ['x', 'y']);
    expect(worn.bow_thruster!.state).toBe('worn');
    expect(worn.gas).toBeUndefined();
    expect(applyDefects(base, boat, ['worn_impeller']).engine_cooling!.state).toBe('worn');
    expect(base.engine_cooling!.state).toBe('ok');
  });
});

describe('performCheckin with defects', () => {
  it('goes to the defects phase when a checked defect has a system', () => {
    const s = performCheckin(atCheckin(['worn_impeller', 'old_scratch']), content, ['impeller']);
    expect(s.phase).toBe('defects');
    expect(s.checkin).toEqual({ found: ['worn_impeller'], fixed: [], minutesLeft: content.balance.checkin.budgetMin - content.balance.checkin.costMin.impeller });
    expect(s.flags['defect.worn_impeller.found']).toBe(true);
    expect(s.flags['defect.old_scratch']).toBe(true);
    expect(s.flags['defect.worn_impeller']).toBeUndefined();
  });
  it('goes straight to briefing when nothing with a system was found', () => {
    expect(performCheckin(atCheckin(['worn_impeller', 'old_scratch']), content, []).phase).toBe('briefing');
    const s = performCheckin(atCheckin(['worn_impeller', 'old_scratch']), content, ['damage_photos']);
    expect(s.phase).toBe('briefing');
    expect(s.checkin).toBeNull();
  });
});

describe('resolveDefects', () => {
  const found = () => performCheckin(atCheckin(['worn_impeller', 'toilet_valve']), content, ['impeller', 'toilets']);

  it('fixes: pays, restores the system, drops the defect, leaves no hidden flag', () => {
    const before = found();
    const s = resolveDefects(before, content, ['worn_impeller']);
    expect(s.phase).toBe('briefing');
    expect(s.systems.engine_cooling!.state).toBe('ok');
    expect(s.systems.heads!.state).toBe('worn');
    expect(s.resources.moneyEur).toBe(before.resources.moneyEur - 60);
    expect(s.checkin).toMatchObject({ fixed: ['worn_impeller'], minutesLeft: before.checkin!.minutesLeft - 20 });
    expect(s.defects).toEqual(['toilet_valve']);
    expect(s.flags['defect.worn_impeller']).toBeUndefined();
    const causes = s.log.map((e) => e.cause);
    expect(causes).toContain('checkin:fix:worn_impeller');
    expect(causes).toContain('checkin:sail_on:toilet_valve');
    expect(causes).not.toContain('checkin:sail_on:worn_impeller');
    expect(s.flags['checkin.toilets.sailed_on']).toBe(true);
    expect(s.flags['checkin.impeller.sailed_on']).toBeUndefined();
  });
  it('sails on with an empty fix list', () => {
    const s = resolveDefects(found(), content, []);
    expect(s.phase).toBe('briefing');
    expect(s.defects).toEqual(['worn_impeller', 'toilet_valve']);
    expect(s.systems.engine_cooling!.state).toBe('worn');
  });
  it('throws BUDGET over the remaining minutes', () => {
    const tight = { ...found(), checkin: { found: ['worn_impeller', 'toilet_valve'], fixed: [], minutesLeft: 30 } };
    expect(() => resolveDefects(tight, content, ['worn_impeller', 'toilet_valve'])).toThrow(expect.objectContaining({ code: 'BUDGET' }));
  });
  it('throws NO_MONEY when the money is short', () => {
    const poor = found();
    const broke = { ...poor, resources: { ...poor.resources, moneyEur: 10 } };
    expect(() => resolveDefects(broke, content, ['worn_impeller'])).toThrow(expect.objectContaining({ code: 'NO_MONEY' }));
  });
  it('rejects ids that were not found or are not fixable, and wrong phase', () => {
    expect(() => resolveDefects(found(), content, ['old_scratch'])).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => resolveDefects(found(), content, ['worn_impeller', 'worn_impeller'])).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(() => resolveDefects(atCheckin([]), content, [])).toThrow(expect.objectContaining({ code: 'WRONG_PHASE' }));
  });
});

describe('two defects on one system', () => {
  it('keeps the system worn until the last defect on it is fixed', async () => {
    const meltemi = (await loadContentDir('content')).content!;
    const mb = meltemi.boats.find((b) => b.id === 'meltemi_40')!;
    const ids = ['torn_genoa_seam', 'worn_furler'];
    let s = chooseBoat(assignVoices(newGame(meltemi, { seed: 3, lang: 'ru' }), meltemi, alloc), meltemi, 'meltemi_40');
    s = { ...s, defects: ids, systems: applyDefects(initialSystems(mb), mb, ids) };
    s = performCheckin(s, meltemi, ['sails']);
    s = { ...s, checkin: { ...s.checkin!, minutesLeft: 100 } };
    expect(s.phase).toBe('defects');
    const part = resolveDefects(s, meltemi, ['worn_furler']);
    expect(part.systems.rig!.state).toBe('worn');
    expect(part.defects).toEqual(['torn_genoa_seam']);
    const both = resolveDefects(s, meltemi, ids);
    expect(both.systems.rig!.state).toBe('worn');
    expect(both.defects).toEqual([]);
  });

  it('a fix restores the boat profile condition, so Meltemi keeps her worn rig', async () => {
    const real = (await loadContentDir('content')).content!;
    const mb = real.boats.find((b) => b.id === 'meltemi_40')!;
    expect(mb.systems.rig).toBe('worn');
    let s = chooseBoat(assignVoices(newGame(real, { seed: 3, lang: 'ru' }), real, alloc), real, 'meltemi_40');
    s = { ...s, defects: ['torn_genoa_seam'], systems: applyDefects(initialSystems(mb), mb, ['torn_genoa_seam']) };
    s = performCheckin(s, real, ['sails']);
    const fixed = resolveDefects({ ...s, checkin: { ...s.checkin!, minutesLeft: 100 } }, real, ['torn_genoa_seam']);
    expect(fixed.systems.rig).toEqual({ state: 'worn', wear: 0, broken: false });
  });
});

describe('finishWeek charges', () => {
  const atReturn = (s: GameState): GameState => ({ ...s, phase: 'return', returnedOnTime: true });
  it('an unfound old_scratch as deposit:unrecorded', () => {
    const s = finishWeek(atReturn(performCheckin(atCheckin(['old_scratch', 'worn_impeller']), content, [])), content);
    expect(s.log.map((e) => e.cause)).toContain('deposit:unrecorded:old_scratch');
    expect(s.damages).toContain('hull_scratch');
  });
  it('does not charge a found scratch or a scratch not among the week defects', () => {
    const found = finishWeek(atReturn(performCheckin(atCheckin(['old_scratch', 'worn_impeller']), content, ['damage_photos'])), content);
    expect(found.damages).not.toContain('hull_scratch');
    const absent = finishWeek(atReturn(performCheckin(atCheckin(['worn_impeller', 'toilet_valve']), content, [])), content);
    expect(absent.damages).not.toContain('hull_scratch');
  });
  it('charges returnCostEur for every system still broken, once, and only for broken ones', () => {
    const priced = { ...content, systems: content.systems.map((d) => (d.returnCostEur === undefined && ['rig', 'heads'].includes(d.id) ? { ...d, returnCostEur: d.id === 'rig' ? 600 : 150 } : d)) };
    const base = atReturn(atCheckin([]));
    const broken = { ...base, systems: { ...base.systems, rig: { ...base.systems.rig!, broken: true } } };
    const s = finishWeek(broken, priced);
    const charges = s.log.filter((e) => e.cause.startsWith('deposit:broken:'));
    expect(charges.map((e) => e.cause)).toEqual(['deposit:broken:rig']);
    expect(charges[0]!.data).toEqual({ eur: 600 });
    expect(charges[0]!.pillar).toBe('boat');
    expect(finishWeek(atReturn(atCheckin([])), priced).log.some((e) => e.cause.startsWith('deposit:broken:'))).toBe(false);
  });
});
