import {
  assignVoices, chooseBoat, endDay, EngineError, finishWeek, newGame, performBriefing, performCheckin, planDay,
  resolvePendingEvent, startDay, validatePlan, type Content, type DayPlan, type GameState, type Lang,
} from '../../engine';
import { screenKey } from './screen';
import type { Action, ManeuverOrders, Session, UiState } from './types';

export const emptyUi = (): UiState => ({ draftPlan: null, passageDay: null, outcome: null, lastOrders: {} });

export function initialSession(content: Content, lang: Lang, game: GameState | null = null): Session {
  return { content, lang: game?.lang ?? lang, game, ui: emptyUi(), error: null };
}

function requireGame(s: Session): GameState {
  if (!s.game) throw new EngineError('WRONG_PHASE', 'No game in progress');
  return s.game;
}

function commitPlan(s: Session, game: GameState, plan: DayPlan, orders: ManeuverOrders): Session {
  const next = planDay(game, s.content, { ...plan, maneuverOrders: orders });
  return {
    ...s,
    game: next,
    error: null,
    ui: { ...s.ui, draftPlan: null, passageDay: plan.legs.length > 0 ? next.day : null, lastOrders: { ...s.ui.lastOrders, ...orders } },
  };
}

function resolveEvent(s: Session, optionId: string): Session {
  const g = requireGame(s);
  const eventId = g.eventQueue[0] ?? '';
  const next = resolvePendingEvent(g, s.content, optionId);
  return { ...s, game: next, error: null, ui: { ...s.ui, outcome: { eventId, optionId, entries: next.log.slice(g.log.length) } } };
}

function reduce(s: Session, a: Action): Session {
  const c = s.content;
  const step = (game: GameState): Session => ({ ...s, game, error: null });
  switch (a.type) {
    case 'new_game': return { ...s, game: newGame(c, { seed: a.seed, lang: s.lang }), ui: emptyUi(), error: null };
    case 'load': return initialSession(c, a.game.lang, a.game);
    case 'to_menu': return { ...s, game: null, ui: emptyUi(), error: null };
    case 'set_lang': return { ...s, lang: a.lang, game: s.game && { ...s.game, lang: a.lang } };
    case 'assign_voices': return step(assignVoices(requireGame(s), c, a.alloc));
    case 'choose_boat': return step(chooseBoat(requireGame(s), c, a.boatId));
    case 'checkin': return step(performCheckin(requireGame(s), c, a.checkpoints));
    case 'briefing': return step(performBriefing(requireGame(s), c, a.topicIds, a.dialogueIds));
    case 'start_day': return step(startDay(requireGame(s), c, a.choice));
    case 'draft_plan': {
      const g = requireGame(s);
      validatePlan(g, c, a.plan);
      return a.plan.legs.length === 0 ? commitPlan(s, g, a.plan, {}) : { ...s, error: null, ui: { ...s.ui, draftPlan: a.plan } };
    }
    case 'cancel_draft': return { ...s, ui: { ...s.ui, draftPlan: null } };
    case 'commit_plan': {
      if (!s.ui.draftPlan) throw new EngineError('WRONG_PHASE', 'No plan to commit');
      return commitPlan(s, requireGame(s), s.ui.draftPlan, a.orders);
    }
    case 'passage_seen': return { ...s, ui: { ...s.ui, passageDay: null } };
    case 'resolve_event': return resolveEvent(s, a.optionId);
    case 'outcome_seen': return { ...s, ui: { ...s.ui, outcome: null } };
    case 'end_day': return step(endDay(requireGame(s), c, a.choice));
    case 'finish_week': return step(finishWeek(requireGame(s), c));
    case 'dismiss_error': return { ...s, error: null };
  }
}

export function sessionReducer(s: Session, a: Action): Session {
  if (a.key !== undefined && a.key !== screenKey(s)) return s;
  try {
    return reduce(s, a);
  } catch (e) {
    if (e instanceof EngineError) return { ...s, error: e.message };
    throw e;
  }
}
