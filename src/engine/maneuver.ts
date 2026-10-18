import { EngineError } from './errors';
import { chance, type RngResult } from './rng';
import { round1 } from './state';
import type { Balance, Content, Effect, Maneuver, ManeuverKind, Outcome } from './types';

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

export function evaluateManeuver(
  rng: number,
  m: Maneuver,
  order: readonly string[],
  flags: Record<string, boolean>,
  riskFactor: number,
  b: Balance,
): RngResult<{ errors: string[]; outcomes: Outcome[] }> {
  const invalid = validateOrder(m, order);
  if (invalid) throw new EngineError('INVALID_INPUT', invalid);
  const errors: string[] = [];
  const outcomes: Outcome[] = [];
  let next = rng;
  for (const err of m.errors) {
    if (order.indexOf(err.wrongIf.first) >= order.indexOf(err.wrongIf.then)) continue;
    const mitigated = err.mitigatedBy !== undefined && flags[err.mitigatedBy] === true;
    const factor = mitigated ? b.safety.mitigationFactor : 1;
    const roll = chance(next, err.injuryChance * riskFactor * factor);
    next = roll.next;
    errors.push(err.id);
    outcomes.push({ cause: `maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: mitigated ? scaleEffect(err.effect, factor) : err.effect });
    if (roll.value) {
      outcomes.push({ cause: `injury:maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
    }
  }
  return { value: { errors, outcomes }, next };
}
