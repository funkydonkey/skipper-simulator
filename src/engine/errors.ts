import type { GameState, Phase } from './types';

export type EngineErrorCode = 'WRONG_PHASE' | 'PENDING_EVENT' | 'INVALID_INPUT' | 'NOT_FOUND' | 'BUDGET' | 'CONTENT'
  | 'NOT_BROKEN' | 'REPAIR_UNAVAILABLE' | 'NO_MONEY';

export class EngineError extends Error {
  constructor(public readonly code: EngineErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
  }
}

export function assertPhase(state: GameState, ...phases: Phase[]): void {
  if (!phases.includes(state.phase)) {
    throw new EngineError('WRONG_PHASE', `Expected phase ${phases.join('|')}, got ${state.phase}`);
  }
}

export function assertNoPendingEvent(state: GameState): void {
  if (state.eventQueue.length > 0) {
    throw new EngineError('PENDING_EVENT', `Resolve event ${state.eventQueue[0]} first`);
  }
}
