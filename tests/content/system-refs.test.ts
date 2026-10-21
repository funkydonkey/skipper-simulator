import { describe, expect, it } from 'vitest';
import { crossValidate } from '../../src/content/validate';
import { makeContent } from '../fixtures/content';

const msgs = (c = makeContent()): string[] => crossValidate(c).map((e) => `${e.path}: ${e.message}`);

describe('system ids in effects (R20)', () => {
  it('fixture is clean', () => {
    expect(msgs()).toEqual([]);
  });

  it('flags an unknown break / repair / wear id in an event option', () => {
    const c = makeContent();
    c.events[0]!.options[1]!.effects = { break: 'engine_coling' };
    c.events[0]!.options[0]!.success = { repair: 'nope' };
    c.events[0]!.options[0]!.fail = { wear: { ghost: 1 } };
    const m = msgs(c);
    expect(m).toContainEqual(expect.stringContaining('"engine_coling"'));
    expect(m).toContainEqual(expect.stringContaining('"nope"'));
    expect(m).toContainEqual(expect.stringContaining('"ghost"'));
  });

  it('flags an unknown id in a failure effect and in a maneuver error effect', () => {
    const c = makeContent();
    c.systems[0]!.failures = [{ id: 'f', phase: 'passage', chance: 0.1, effect: { break: 'typo' } }];
    c.maneuvers[0]!.errors[0]!.effect = { break: 'typo2' };
    const m = msgs(c);
    expect(m).toContainEqual(expect.stringContaining('"typo"'));
    expect(m).toContainEqual(expect.stringContaining('"typo2"'));
  });

  it('accepts known ids', () => {
    const c = makeContent();
    c.events[0]!.options[1]!.effects = { break: 'heads', repair: 'rig', wear: { engine_cooling: 1 } };
    expect(msgs(c)).toEqual([]);
  });
});

describe('failure events', () => {
  it('flags a failure whose event does not exist', () => {
    const c = makeContent();
    c.systems[0]!.failures = [{ id: 'f', phase: 'evening', chance: 0.1, event: 'toilet_clogg' }];
    expect(msgs(c)).toEqual(['systems[0].failures[0].event: unknown event "toilet_clogg"']);
  });

  it('flags a failure whose event fires in another phase', () => {
    const c = makeContent();
    const ev = c.events.find((e) => e.id === 'toilet_clog')!;
    expect(ev.trigger.phase).toBe('evening');
    c.systems[0]!.failures = [{ id: 'f', phase: 'passage', chance: 0.1, event: 'toilet_clog' }];
    expect(msgs(c)).toEqual(['systems[0].failures[0].event: event "toilet_clog" fires in phase "evening", the failure in "passage"']);
  });

  it('accepts a failure event in the same phase', () => {
    const c = makeContent();
    c.systems[0]!.failures = [{ id: 'f', phase: 'evening', chance: 0.1, event: 'toilet_clog' }];
    expect(msgs(c)).toEqual([]);
  });
});

describe('simTargets.weakness ids', () => {
  const withWeakness = (weakness: Record<string, { systems: string[]; causes: string[] }>) => {
    const c = makeContent();
    return { ...c, balance: { ...c.balance, simTargets: { ...c.balance.simTargets, weakness } } };
  };

  it('accepts boats and systems that exist in content, whatever their ids', () => {
    expect(msgs(withWeakness({ test_boat: { systems: ['rig', 'heads'], causes: ['fault:rig'] } }))).toEqual([]);
  });

  it('flags a boat that is not in content.boats', () => {
    expect(msgs(withWeakness({ aurora_45: { systems: ['rig'], causes: [] } }))).toEqual(['balance.simTargets.weakness.aurora_45: unknown boat "aurora_45"']);
  });

  it('flags a system that is not in content.systems', () => {
    expect(msgs(withWeakness({ test_boat: { systems: ['sonar'], causes: [] } }))).toEqual(['balance.simTargets.weakness.test_boat.systems[0]: unknown system "sonar"']);
  });
});
