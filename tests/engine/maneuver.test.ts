import { describe, expect, it } from 'vitest';
import { correctOrder, evaluateManeuver, maneuverForKind, scaleEffect, validateOrder } from '../../src/engine/maneuver';
import { makeContent } from '../fixtures/content';

const content = makeContent();
const b = content.balance;
const m = maneuverForKind(content, 'departure')!;
const wrong = ['release_lines', 'neutral', 'command_helm', 'engage_gear'];

describe('maneuver', () => {
  it('finds maneuver by kind', () => {
    expect(m.id).toBe('dep_test');
    expect(maneuverForKind(content, 'anchoring')!.id).toBe('anchoring_test');
    expect(correctOrder(m)).toEqual(['neutral', 'command_helm', 'release_lines', 'engage_gear']);
  });

  it('validateOrder requires a permutation of all steps', () => {
    expect(validateOrder(m, correctOrder(m))).toBeNull();
    expect(validateOrder(m, ['neutral'])).toMatch(/4 steps/);
    expect(validateOrder(m, ['neutral', 'neutral', 'command_helm', 'engage_gear'])).toMatch(/duplicate|missing/);
    expect(validateOrder(m, ['neutral', 'command_helm', 'release_lines', 'jump'])).toMatch(/unknown step "jump"/);
  });

  it('correct order → no errors, no outcomes', () => {
    const r = evaluateManeuver(1, m, correctOrder(m), {}, 1, b);
    expect(r.value).toEqual({ errors: [], outcomes: [] });
  });

  it('wrong order → every violated rule fires', () => {
    const r = evaluateManeuver(1, m, wrong, {}, 0, b);
    expect(r.value.errors).toEqual(['release_before_neutral', 'release_before_command']);
    expect(r.value.outcomes).toEqual([
      { cause: 'maneuver:dep_test:release_before_neutral', pillar: 'safety', effect: { damage: 'prop_line', mood: -5 } },
      { cause: 'maneuver:dep_test:release_before_command', pillar: 'safety', effect: { mood: -6, fatigue: 6 } },
    ]);
  });

  it('injury roll scales with risk factor; briefing mitigates', () => {
    const forced = evaluateManeuver(1, m, wrong, {}, 5, b);
    expect(forced.value.outcomes).toContainEqual({ cause: 'injury:maneuver:dep_test:release_before_command', pillar: 'safety', effect: { injury: true, mood: -30 } });
    const mitigated = evaluateManeuver(1, m, wrong, { 'briefing.loaded_lines': true }, 0, b);
    expect(mitigated.value.outcomes[1]!.effect).toEqual({ mood: -3, fatigue: 3 });
  });

  it('throws on invalid order', () => {
    expect(() => evaluateManeuver(1, m, ['neutral'], {}, 1, b)).toThrow(/INVALID|4 steps/);
  });

  it('scaleEffect keeps non-numeric fields', () => {
    expect(scaleEffect({ mood: -6, damage: 'prop_line', injury: true }, 0.5)).toEqual({ mood: -3, damage: 'prop_line', injury: true });
  });
});
