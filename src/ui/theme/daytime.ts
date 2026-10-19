import type { Balance, GameState } from '../../engine';
import type { Screen } from '../session/types';

export type Daytime = 'dawn' | 'day' | 'dusk' | 'night';

/** UI tint thresholds around balance.time.sunsetHour. Presentation only, not game balance. */
export const DUSK_BEFORE_SUNSET_H = 1.5;
export const NIGHT_AFTER_SUNSET_H = 0.5;
const MIN_PER_HOUR = 60;

export function daytimeFor(game: GameState | null, b: Balance, screen: Screen): Daytime {
  if (!game || screen === 'debrief') return 'dawn';
  if (game.phase === 'captain' || game.phase === 'boat_select') return 'day';
  if (game.phase === 'checkin' || game.phase === 'briefing') return 'dusk';
  if (game.phase === 'morning') return 'dawn';
  const h = game.clockMin / MIN_PER_HOUR;
  if (h >= b.time.sunsetHour + NIGHT_AFTER_SUNSET_H) return 'night';
  return h >= b.time.sunsetHour - DUSK_BEFORE_SUNSET_H ? 'dusk' : 'day';
}
