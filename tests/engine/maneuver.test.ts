import { describe, expect, it } from 'vitest';
import { correctOrder, evaluateManeuver, maneuverFor, scaleEffect, validateOrder } from '../../src/engine/maneuver';
import { makeContent } from '../fixtures/content';

const content = makeContent();
const b = content.balance;
const m = maneuverFor(content, 'departure')!;
const wrong = ['release_lines', 'neutral', 'command_helm', 'engage_gear'];
/** Caution/order context: risk factor 1 at level 0; order 10 → factor 0; caution -50 → factor 5. */
const risk = (caution: number, order: number, flags: Record<string, boolean> = {}) => ({ 'voice.caution': caution, 'voice.order': order, ...flags });
const neutral = risk(0, 0);
const safe = (flags: Record<string, boolean> = {}) => risk(0, 10, flags);

describe('maneuver', () => {
  it('finds maneuver by kind', () => {
    expect(m.id).toBe('dep_test');
    expect(maneuverFor(content, 'anchoring')!.id).toBe('anchoring_test');
    expect(correctOrder(m)).toEqual(['neutral', 'command_helm', 'release_lines', 'engage_gear']);
  });

  it('validateOrder rejects unknown and duplicate steps only (R4)', () => {
    expect(validateOrder(m, correctOrder(m))).toBeNull();
    expect(validateOrder(m, ['neutral'])).toBeNull();
    expect(validateOrder(m, ['neutral', 'neutral', 'command_helm', 'engage_gear'])).toMatch(/duplicate/);
    expect(validateOrder(m, ['neutral', 'command_helm', 'release_lines', 'jump'])).toMatch(/unknown step "jump"/);
  });

  it('correct order → no errors, no outcomes', () => {
    const r = evaluateManeuver(1, m, correctOrder(m), neutral, b);
    expect(r.value).toEqual({ steps: correctOrder(m), errors: [], outcomes: [], rolls: [] });
  });

  it('wrong order → every violated rule fires', () => {
    const r = evaluateManeuver(1, m, wrong, safe(), b);
    expect(r.value.errors).toEqual(['release_before_neutral', 'release_before_command']);
    expect(r.value.outcomes).toEqual([
      { cause: 'maneuver:dep_test:release_before_neutral', pillar: 'safety', effect: { damage: 'prop_line', mood: -5 } },
      { cause: 'maneuver:dep_test:release_before_command', pillar: 'safety', effect: { mood: -6, fatigue: 6 } },
    ]);
  });

  it('injury roll scales with risk factor; briefing mitigates', () => {
    const forced = evaluateManeuver(1, m, wrong, risk(-50, 0), b);
    expect(forced.value.outcomes).toContainEqual({ cause: 'injury:maneuver:dep_test:release_before_command', pillar: 'safety', effect: { injury: true, mood: -30 } });
    const mitigated = evaluateManeuver(1, m, wrong, safe({ 'briefing.loaded_lines': true }), b);
    expect(mitigated.value.outcomes[1]!.effect).toEqual({ mood: -3, fatigue: 3 });
  });

  it('a partial order is completed in content order; an unknown step throws', () => {
    expect(evaluateManeuver(1, m, ['engage_gear'], neutral, b).value.steps).toEqual(['engage_gear', 'neutral', 'command_helm', 'release_lines']);
    expect(() => evaluateManeuver(1, m, ['jump'], neutral, b)).toThrow(/INVALID|unknown step/);
  });

  it('scaleEffect keeps non-numeric fields', () => {
    expect(scaleEffect({ mood: -6, damage: 'prop_line', injury: true }, 0.5)).toEqual({ mood: -3, damage: 'prop_line', injury: true });
  });
});
