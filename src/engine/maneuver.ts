import { evaluateChance, rollChance } from './chance';
import { EngineError } from './errors';
import { buildConditionContext, evaluateCondition, type CondContext } from './expr';
import { injurySpec } from './odds';
import type { RngResult } from './rng';
import { round1 } from './state';
import type { Balance, ChanceValue, Content, Effect, GameState, Maneuver, ManeuverError, ManeuverKind, Outcome } from './types';

const NUMERIC_EFFECT_KEYS = ['mood', 'fatigue', 'money', 'water', 'fuel', 'service_bank', 'starter_bank', 'gas', 'time_hours', 'mood_per_day'] as const;

export function maneuverForKind(content: Content, kind: ManeuverKind): Maneuver | null {
  return content.maneuvers.find((m) => m.kind === kind) ?? null;
}

export const correctOrder = (m: Maneuver): string[] => m.steps.map((s) => s.id);

export function validateOrder(m: Maneuver, order: readonly string[]): string | null {
  if (order.length !== m.steps.length) return `Maneuver ${m.id} needs ${m.steps.length} steps, got ${order.length}`;
  const ids = new Set(correctOrder(m));
  const unknown = order.find((id) => !ids.has(id));
  if (unknown) return `Maneuver ${m.id}: unknown step "${unknown}"`;
  if (new Set(order).size !== order.length) return `Maneuver ${m.id}: duplicate or missing steps`;
  return null;
}

export function scaleEffect(e: Effect, factor: number): Effect {
  const scaled: Effect = { ...e };
  for (const k of NUMERIC_EFFECT_KEYS) {
    const v = e[k];
    if (v !== undefined) scaled[k] = round1(v * factor);
  }
  return scaled;
}

export interface ManeuverRoll { cause: string; hit: boolean; odds: ChanceValue }

/** Context: caution/order voices and the errors' mitigation flags (see buildConditionContext). */
export function evaluateManeuver(
  rng: number,
  m: Maneuver,
  order: readonly string[],
  ctx: CondContext,
  b: Balance,
): RngResult<{ errors: string[]; outcomes: Outcome[]; rolls: ManeuverRoll[] }> {
  const invalid = validateOrder(m, order);
  if (invalid) throw new EngineError('INVALID_INPUT', invalid);
  const errors: string[] = [];
  const outcomes: Outcome[] = [];
  const rolls: ManeuverRoll[] = [];
  let next = rng;
  for (const err of m.errors) {
    if (order.indexOf(err.wrongIf.first) >= order.indexOf(err.wrongIf.then)) continue;
    // Same condition as injurySpec's mitigation mod: the effect and the injury chance are scaled together.
    const mitigated = err.mitigatedBy !== undefined && evaluateCondition(err.mitigatedBy, ctx);
    const roll = rollChance(next, injurySpec(err.injuryChance, err.mitigatedBy, b), ctx);
    next = roll.next;
    errors.push(err.id);
    rolls.push({ cause: `roll:injury:maneuver:${m.id}:${err.id}`, hit: roll.value.hit, odds: roll.value.odds });
    outcomes.push({ cause: `maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: mitigated ? scaleEffect(err.effect, b.safety.mitigationFactor) : err.effect });
    if (roll.value.hit) {
      outcomes.push({ cause: `injury:maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
    }
  }
  return { value: { errors, outcomes, rolls }, next };
}

/** Injury odds of the maneuver's most dangerous error, as the captain stands now. Null if nothing can hurt. */
export function maneuverRisk(state: GameState, content: Content, kind: ManeuverKind): ChanceValue | null {
  const m = maneuverForKind(content, kind);
  const worst = m?.errors.reduce<ManeuverError | null>((a, e) => (e.injuryChance > (a?.injuryChance ?? 0) ? e : a), null);
  if (!worst) return null;
  return evaluateChance(injurySpec(worst.injuryChance, worst.mitigatedBy, content.balance), buildConditionContext(state, content));
}
