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
