import type { Balance, GameState, Grade } from './types';

export const canAfford = (state: GameState, eur: number): boolean => state.resources.moneyEur >= eur;

/** Money spent over the week: start balance (after the boat is paid) minus final money, plus the lost deposit. */
export const weekSpend = (state: GameState, depositLossEur: number): number =>
  state.startBalanceEur - state.resources.moneyEur + depositLossEur;

export function budgetGrade(spend: number, finalMoney: number, b: Balance): Grade {
  if (finalMoney < 0) return 'bad';
  if (spend <= b.budget.weekEur) return 'good';
  return spend <= b.budget.weekEur * b.budget.okFactor ? 'ok' : 'bad';
}
