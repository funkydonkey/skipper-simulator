import { evaluateChance, rollChance } from './chance';
import { EngineError } from './errors';
import { buildConditionContext, evaluateCondition, type CondContext } from './expr';
import { injurySpec } from './odds';
import type { RngResult } from './rng';
import { round1 } from './state';
import { situationContext } from './situation-context';
import type { Balance, BerthType, ChanceValue, Content, Effect, GameState, Maneuver, ManeuverError, ManeuverKind, ManeuverStep, Outcome, Situation } from './types';

const NUMERIC_EFFECT_KEYS = ['mood', 'fatigue', 'money', 'water', 'fuel', 'service_bank', 'starter_bank', 'gas', 'time_hours', 'mood_per_day'] as const;

/** Order level from which the captain is told which situation step today adds. */
const SITUATION_HINT_LEVEL = 3;

/** The maneuver of `kind` for `berth`, else the kind's default (the one without a berth). */
export function maneuverFor(content: Content, kind: ManeuverKind, berth?: BerthType): Maneuver | null {
  const ofKind = content.maneuvers.filter((m) => m.kind === kind);
  return (berth !== undefined ? ofKind.find((m) => m.berth === berth) : undefined) ?? ofKind.find((m) => m.berth === undefined) ?? null;
}

const applies = (when: string | undefined, ctx: CondContext): boolean => when === undefined || evaluateCondition(when, ctx);

/** Today's steps: those whose `when` holds in `ctx`, in content order. */
export const stepsFor = (m: Maneuver, ctx: CondContext): ManeuverStep[] => m.steps.filter((s) => applies(s.when, ctx));

/** Today's errors: those whose `when` holds in `ctx`, in content order. */
export const errorsFor = (m: Maneuver, ctx: CondContext): ManeuverError[] => m.errors.filter((e) => applies(e.when, ctx));

/** Ids of today's steps; without `ctx`, the unconditional steps only. */
export function correctOrder(m: Maneuver, ctx?: CondContext): string[] {
  const steps = ctx ? stepsFor(m, ctx) : m.steps.filter((s) => s.when === undefined);
  return steps.map((s) => s.id);
}

/** Plan-time check (R4): every id is a step of the maneuver, none repeats. A partial order is fine. */
export function validateOrder(m: Maneuver, order: readonly string[]): string | null {
  const ids = new Set(m.steps.map((s) => s.id));
  const unknown = order.find((id) => !ids.has(id));
  if (unknown) return `Maneuver ${m.id}: unknown step "${unknown}"`;
  if (new Set(order).size !== order.length) return `Maneuver ${m.id}: duplicate steps`;
  return null;
}

/** R4: the order's steps that exist today, in the player's order, then the missing ones in content order. */
export function reconcileOrder(order: readonly string[], steps: readonly ManeuverStep[]): string[] {
  const today = new Set(steps.map((s) => s.id));
  const kept = order.filter((id, i) => today.has(id) && order.indexOf(id) === i);
  const given = new Set(kept);
  return [...kept, ...steps.filter((s) => !given.has(s.id)).map((s) => s.id)];
}

/** The first conditional step that applies today, once the order voice is strong enough to notice it. */
export function situationHint(m: Maneuver, ctx: CondContext, orderLevel: number): ManeuverStep | null {
  if (orderLevel < SITUATION_HINT_LEVEL) return null;
  return m.steps.find((s) => s.when !== undefined && evaluateCondition(s.when, ctx)) ?? null;
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

/** Context: caution/order voices, the errors' mitigation flags and the situation keys (see buildConditionContext). Judges the reconciled order. */
export function evaluateManeuver(
  rng: number,
  m: Maneuver,
  order: readonly string[],
  ctx: CondContext,
  b: Balance,
): RngResult<{ steps: string[]; errors: string[]; outcomes: Outcome[]; rolls: ManeuverRoll[] }> {
  const invalid = validateOrder(m, order);
  if (invalid) throw new EngineError('INVALID_INPUT', invalid);
  const steps = reconcileOrder(order, stepsFor(m, ctx));
  const errors: string[] = [];
  const outcomes: Outcome[] = [];
  const rolls: ManeuverRoll[] = [];
  let next = rng;
  for (const err of errorsFor(m, ctx)) {
    const first = steps.indexOf(err.wrongIf.first);
    const then = steps.indexOf(err.wrongIf.then);
    // An error over a step that does not exist today cannot fire.
    if (first < 0 || then < 0 || first >= then) continue;
    // Same condition as injurySpec's mitigation mod: the effect and the injury chance are scaled together.
    const mitigated = err.mitigatedBy !== undefined && evaluateCondition(err.mitigatedBy, ctx);
    const roll = rollChance(next, injurySpec(err.injuryChance, err.mitigatedBy, b, m.injuryMods), ctx);
    next = roll.next;
    errors.push(err.id);
    rolls.push({ cause: `roll:injury:maneuver:${m.id}:${err.id}`, hit: roll.value.hit, odds: roll.value.odds });
    outcomes.push({ cause: `maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: mitigated ? scaleEffect(err.effect, b.safety.mitigationFactor) : err.effect });
    if (roll.value.hit) {
      outcomes.push({ cause: `injury:maneuver:${m.id}:${err.id}`, pillar: 'safety', effect: { injury: true, mood: -b.mood.injury } });
    }
  }
  return { value: { steps, errors, outcomes, rolls }, next };
}

/**
 * The context a maneuver at `situation` will be judged in: the captain as they stand now, plus the situation's keys
 * and its seabed (on arrival `place.seabed` is the destination's). Without a situation, the context as it is.
 */
export function situationCondContext(state: GameState, content: Content, situation: Situation | null | undefined): CondContext {
  const now = buildConditionContext(state, content);
  return situation ? { ...now, ...situationContext(situation), 'place.seabed': situation.seabed } : now;
}

/**
 * Injury odds of the maneuver's most dangerous error, as the captain stands now. Null if nothing can hurt.
 * With a `situation`, the maneuver of its berth and the errors that apply there.
 */
export function maneuverRisk(state: GameState, content: Content, kind: ManeuverKind, situation?: Situation | null): ChanceValue | null {
  const m = maneuverFor(content, kind, situation?.berth);
  if (!m) return null;
  const ctx = situationCondContext(state, content, situation);
  const worst = errorsFor(m, ctx).reduce<ManeuverError | null>((a, e) => (e.injuryChance > (a?.injuryChance ?? 0) ? e : a), null);
  if (!worst) return null;
  return evaluateChance(injurySpec(worst.injuryChance, worst.mitigatedBy, content.balance, m.injuryMods), ctx);
}
