import {
  assignVoices, chooseBoat, finishWeek, newGame, performBriefing, performCheckin, planDay, resolveDefects, startDay,
  type Content, type GameState, type Phase,
} from '../../src/engine';
import { drainEvents, playDay } from '../../src/sim/run';
import { expert } from '../../src/sim/strategies';
import { loadBundledContent } from '../../src/ui/content';

const loaded = loadBundledContent();
if (!loaded.content) throw new Error('Bundled content is invalid');
export const content: Content = loaded.content;

/** A real GameState in the requested phase, built through the engine with the expert strategy. */
export function gameAt(phase: Phase, seed = 42): GameState {
  let s = newGame(content, { seed, lang: 'ru', weatherTemplateId: 'meltemi_week' });
  if (phase === 'captain') return s;
  s = assignVoices(s, content, expert.voices);
  if (phase === 'boat_select') return s;
  s = chooseBoat(s, content, expert.boatId);
  if (phase === 'checkin') return s;
  s = performCheckin(s, content, expert.checkpoints(content));
  if (s.phase === 'defects') s = resolveDefects(s, content, []);
  if (phase === 'briefing') return s;
  s = performBriefing(s, content, expert.briefingTopics, expert.briefingDialogues);
  if (phase === 'morning') return s;
  if (phase === 'planning') return drainEvents(startDay(s, content, expert.morning(s, content)), content, expert);
  if (phase === 'evening') {
    const planning = drainEvents(startDay(s, content, expert.morning(s, content)), content, expert);
    return drainEvents(planDay(planning, content, expert.plan(planning, content)), content, expert);
  }
  while (s.phase === 'morning') s = playDay(s, content, expert);
  return phase === 'return' ? s : finishWeek(s, content);
}

/** Puts an event at the head of the queue, as the engine does when it fires. */
export function withEvent(game: GameState, eventId: string): GameState {
  return { ...game, eventQueue: [eventId, ...game.eventQueue], firedEvents: [...game.firedEvents, eventId] };
}
