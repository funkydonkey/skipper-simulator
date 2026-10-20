import type { Phase } from '../../engine';
import type { Screen, Session } from './types';

const PHASE_SCREEN: Record<Exclude<Phase, 'planning'>, Screen> = {
  captain: 'captain',
  boat_select: 'boat',
  checkin: 'checkin',
  defects: 'defects',
  briefing: 'briefing',
  morning: 'morning',
  evening: 'evening',
  return: 'return',
  debrief: 'debrief',
};

export function screenFor(s: Session): Screen {
  const g = s.game;
  if (!g) return 'menu';
  if (s.ui.outcome) return 'outcome';
  if (g.phase === 'evening' && s.ui.passageDay === g.day) return 'passage';
  if (g.eventQueue.length > 0) return 'event';
  if (g.phase === 'planning') return s.ui.draftPlan ? 'maneuvers' : 'planning';
  return PHASE_SCREEN[g.phase];
}

/** Changes on every engine step, so screens remount with fresh local state. */
export function screenKey(s: Session): string {
  const g = s.game;
  return [screenFor(s), g?.day ?? 0, g?.eventQueue[0] ?? '', g?.log.length ?? 0, s.ui.draftPlan ? 'd' : ''].join(':');
}
