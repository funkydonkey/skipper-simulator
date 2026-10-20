import { evaluateChance, rollChance } from './chance';
import { EngineError, assertPhase } from './errors';
import { buildConditionContext, evaluateCondition, type CondContext } from './expr';
import { appendLog } from './log';
import { checkSpec } from './odds';
import { applyOutcome } from './resources';
import { requireBoat } from './state';
import type { ChanceValue, Content, GameState, RepairOption, SystemDef, SystemId } from './types';
import { grantCheckXp } from './xp';

export interface RepairChoice {
  systemId: SystemId; option: RepairOption;
  available: boolean; reason?: 'requires' | 'no_money';
  odds?: ChanceValue;
}

const requiresMet = (o: RepairOption, ctx: CondContext): boolean => o.requires === undefined || evaluateCondition(o.requires, ctx);
const costOf = (o: RepairOption): number => o.costEur ?? 0;

/** Options of every broken system, in content order. Odds use the context `repairSystem` rolls with. */
export function repairOptions(state: GameState, content: Content): RepairChoice[] {
  const ctx = buildConditionContext(state, content);
  return content.systems
    .filter((d) => state.systems[d.id]?.broken)
    .flatMap((d) => d.repairs.map((option): RepairChoice => {
      const reason = !requiresMet(option, ctx) ? 'requires' : state.resources.moneyEur < costOf(option) ? 'no_money' : undefined;
      return {
        systemId: d.id, option, available: reason === undefined, ...(reason ? { reason } : {}),
        ...(option.check ? { odds: evaluateChance(checkSpec(option.check, content.balance), ctx) } : {}),
      };
    }));
}

function findRepair(state: GameState, content: Content, systemId: SystemId, repairId: string): { def: SystemDef; option: RepairOption } {
  const def = content.systems.find((d) => d.id === systemId);
  if (!def) throw new EngineError('NOT_FOUND', `Unknown system ${systemId}`);
  if (!state.systems[systemId]?.broken) throw new EngineError('NOT_BROKEN', `${systemId} is not broken`);
  const option = def.repairs.find((r) => r.id === repairId);
  if (!option) throw new EngineError('NOT_FOUND', `Unknown repair ${systemId}/${repairId}`);
  return { def, option };
}

export function repairSystem(state: GameState, content: Content, systemId: SystemId, repairId: string): GameState {
  assertPhase(state, 'evening', 'planning');
  const { option } = findRepair(state, content, systemId, repairId);
  const ctx = buildConditionContext(state, content);
  if (!requiresMet(option, ctx)) throw new EngineError('REPAIR_UNAVAILABLE', `${systemId}/${repairId} is not possible here`);
  if (state.resources.moneyEur < costOf(option)) throw new EngineError('NO_MONEY', `${systemId}/${repairId} costs ${costOf(option)} EUR`);

  const cause = `repair:${systemId}:${repairId}`;
  let s = applyOutcome(state, requireBoat(content, state), {
    cause, pillar: 'boat', effect: { money: -costOf(option), time_hours: option.timeHours ?? 0 },
  }, content.balance);

  let success = true;
  if (option.check) {
    const r = rollChance(s.rng, checkSpec(option.check, content.balance), ctx);
    const { odds } = r.value;
    success = r.value.hit;
    const rollCause = `roll:check:repair:${systemId}:${repairId}`;
    s = appendLog({ ...s, rng: r.next }, { kind: 'roll', cause: rollCause, pillar: 'boat', odds, data: { hit: success, success, chance: odds.value } });
    s = grantCheckXp(s, option.check.voice, success, rollCause, content.balance);
  }
  if (success) {
    const cur = s.systems[systemId]!;
    s = { ...s, systems: { ...s.systems, [systemId]: option.restores === 'ok' ? { state: 'ok', wear: 0, broken: false } : { ...cur, broken: false } } };
  }
  return appendLog(s, { kind: 'effect', cause: `${cause}:${success ? 'success' : 'fail'}`, pillar: 'boat' });
}
