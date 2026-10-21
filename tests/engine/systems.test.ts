import { describe, expect, it } from 'vitest';
import { buildConditionContext, evaluateCondition as evaluate } from '../../src/engine/expr';
import { applyOutcome } from '../../src/engine/resources';
import { applyDefects } from '../../src/engine/defects';
import { initialSystems, systemContext } from '../../src/engine/systems';
import { assignVoices, chooseBoat, newGame } from '../../src/engine';
import { content } from '../ui/fixtures';
import { deepFreeze } from '../fixtures/freeze';
import type { Boat, GameState } from '../../src/engine/types';

const boatOf = (id: string): Boat => content.boats.find((b) => b.id === id)!;
const aurora = boatOf('aurora_45');
const calypso = boatOf('calypso_38');

function on(boatId: string): GameState {
  const s = assignVoices(newGame(content, { seed: 7, lang: 'ru' }), content, { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 });
  return chooseBoat(s, content, boatId);
}

describe('systems model', () => {
  it('initialSystems copies the boat profile with zero wear and nothing broken', () => {
    const sys = initialSystems(aurora);
    expect(sys.bow_thruster).toEqual({ state: 'worn', wear: 0, broken: false });
    expect(sys.rig).toEqual({ state: 'ok', wear: 0, broken: false });
    expect(Object.keys(sys).sort()).toEqual(Object.keys(aurora.systems).sort());
  });

  it('newGame has no systems; chooseBoat initialises them', () => {
    expect(newGame(content, { seed: 1, lang: 'ru' }).systems).toEqual({});
    const s = on('aurora_45');
    expect(s.systems).toEqual(applyDefects(initialSystems(aurora), aurora, s.defects));
  });

  it('systemContext reports none/false/0 for a system the boat lacks', () => {
    const ctx = systemContext(on('calypso_38'), content);
    expect(ctx['system.bow_thruster.state']).toBe('none');
    expect(ctx['system.bow_thruster.broken']).toBe(false);
    expect(ctx['system.bow_thruster.wear']).toBe(0);
    expect(ctx['system.rig.state']).toBe('ok');
  });

  it('conditions read system keys and never throw for an absent system', () => {
    const calypsoCtx = buildConditionContext(on('calypso_38'), content);
    expect(evaluate('system.bow_thruster.broken', calypsoCtx)).toBe(false);
    const auroraCtx = buildConditionContext(on('aurora_45'), content);
    expect(evaluate("system.bow_thruster.state == 'worn'", auroraCtx)).toBe(true);
    expect(evaluate('system.rig.wear >= 1', auroraCtx)).toBe(false);
  });
});

describe('system effects', () => {
  const s0 = deepFreeze(on('aurora_45'));
  const apply = (s: GameState, effect: object, boat = aurora): GameState => applyOutcome(s, boat, { cause: 't', effect });

  it('break, repair and wear change the named system immutably', () => {
    const broken = apply(s0, { break: 'rig' });
    expect(broken.systems.rig!.broken).toBe(true);
    expect(s0.systems.rig!.broken).toBe(false);
    expect(apply(broken, { repair: 'rig' }).systems.rig!.broken).toBe(false);
    expect(apply(s0, { wear: { rig: 3 } }).systems.rig!.wear).toBe(3);
    expect(apply(apply(s0, { wear: { rig: 3 } }), { wear: { rig: 2 } }).systems.rig!.wear).toBe(5);
  });

  it('logs break:<system> only when the system goes from working to broken', () => {
    const breaks = (s: GameState): string[] => s.log.map((e) => e.cause).filter((c) => c.startsWith('break:'));
    const once = apply(s0, { break: 'rig' });
    expect(breaks(once)).toEqual(['break:rig']);
    expect(once.log.find((e) => e.cause === 'break:rig')).toMatchObject({ kind: 'effect', pillar: 'boat' });
    expect(breaks(apply(once, { break: 'rig' }))).toEqual(['break:rig']);
    expect(breaks(apply(on('calypso_38'), { break: 'bow_thruster' }, calypso))).toEqual([]);
    expect(breaks(apply(s0, { mood: -1 }))).toEqual([]);
  });

  it('is a no-op for a system not on the boat', () => {
    const c = on('calypso_38');
    const after = apply(c, { break: 'bow_thruster', repair: 'bow_thruster', wear: { bow_thruster: 4 } }, calypso);
    expect(after.systems).toEqual(c.systems);
  });

  it('repair leaves damages unchanged', () => {
    const s = { ...s0, damages: ['hull_scratch'] };
    expect(apply(s, { repair: 'hull_scratch' }).damages).toEqual(['hull_scratch']);
    expect(apply({ ...s, damages: ['rig'] }, { repair: 'rig' }).damages).toEqual(['rig']);
  });
});
