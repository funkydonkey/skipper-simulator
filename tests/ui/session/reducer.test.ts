import { describe, expect, it } from 'vitest';
import { expert } from '../../../src/sim/strategies';
import { initialSession, sessionReducer } from '../../../src/ui/session/reducer';
import { screenFor, screenKey } from '../../../src/ui/session/screen';
import type { Action, Session } from '../../../src/ui/session/types';
import { content, gameAt, withEvent } from '../fixtures';

const run = (s: Session, ...actions: Action[]): Session => actions.reduce(sessionReducer, s);
const withGame = (phase: Parameters<typeof gameAt>[0]): Session => initialSession(content, 'ru', gameAt(phase));

describe('sessionReducer', () => {
  it('walks the setup phases to the first morning', () => {
    const s = run(
      initialSession(content, 'ru'),
      { type: 'new_game', seed: 7 },
      { type: 'assign_voices', alloc: expert.voices },
      { type: 'choose_boat', boatId: expert.boatId },
      { type: 'checkin', checkpoints: expert.checkpoints },
      { type: 'briefing', topicIds: expert.briefingTopics, dialogueIds: [] },
    );
    expect(s.error).toBeNull();
    expect(s.game?.day).toBe(1);
    expect(screenFor(s)).toBe('morning');
  });

  it('turns EngineError into session.error and keeps the game', () => {
    const before = run(initialSession(content, 'ru'), { type: 'new_game', seed: 7 });
    const after = sessionReducer(before, { type: 'assign_voices', alloc: { sea_sense: 4 } });
    expect(after.game).toBe(before.game);
    expect(after.error).toMatch(/sum must be/);
    expect(sessionReducer(after, { type: 'dismiss_error' }).error).toBeNull();
  });

  it('a stay-in-place plan commits at once and skips the passage screen', () => {
    const s = sessionReducer(withGame('planning'), {
      type: 'draft_plan',
      plan: { departureHour: 9, legs: [], swimStops: 0, shower: 'normal', autopilot: false },
    });
    expect(s.game?.phase).toBe('evening');
    expect(s.ui.passageDay).toBeNull();
    expect(['evening', 'event']).toContain(screenFor(s));
  });

  it('a sailing plan goes through maneuvers, then the passage summary', () => {
    const start = withGame('planning');
    const plan = expert.plan(start.game!, content);
    const drafted = sessionReducer(start, { type: 'draft_plan', plan });
    expect(screenFor(drafted)).toBe('maneuvers');
    const back = sessionReducer(drafted, { type: 'cancel_draft' });
    expect(screenFor(back)).toBe('planning');
    const committed = sessionReducer(drafted, { type: 'commit_plan', orders: {} });
    expect(committed.game?.phase).toBe('evening');
    expect(screenFor(committed)).toBe('passage');
    expect(screenFor(sessionReducer(committed, { type: 'passage_seen' }))).not.toBe('passage');
  });

  it('resolving an event shows its outcome with the new log entries', () => {
    const ev = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
    const option = ev.options.find((o) => !o.requires)!;
    const start = initialSession(content, 'ru', withEvent(gameAt('evening'), ev.id));
    expect(screenFor(start)).toBe('event');
    const s = sessionReducer(start, { type: 'resolve_event', optionId: option.id });
    expect(screenFor(s)).toBe('outcome');
    expect(s.ui.outcome).toMatchObject({ eventId: ev.id, optionId: option.id });
    expect(s.ui.outcome!.entries.some((e) => e.cause === `choice:${ev.id}:${option.id}`)).toBe(true);
    expect(screenFor(sessionReducer(s, { type: 'outcome_seen' }))).toBe('evening');
  });

  it('ignores an action tagged with a stale screen key (double click)', () => {
    const ev = content.events.find((e) => e.trigger.phase === 'evening' && e.options.some((o) => !o.requires))!;
    const option = ev.options.find((o) => !o.requires)!;
    const start = initialSession(content, 'ru', withEvent(gameAt('evening'), ev.id));
    const key = screenKey(start);
    const once = sessionReducer(start, { type: 'resolve_event', optionId: option.id, key });
    const twice = sessionReducer(once, { type: 'resolve_event', optionId: option.id, key });
    expect(twice).toBe(once);
  });

  it('set_lang switches both the session and the running game', () => {
    const s = sessionReducer(withGame('morning'), { type: 'set_lang', lang: 'en' });
    expect(s.lang).toBe('en');
    expect(s.game?.lang).toBe('en');
  });

  it('screen priority: outcome > passage > event > phase', () => {
    const base = withGame('evening');
    const ev = content.events.find((e) => e.trigger.phase === 'evening')!;
    const queued: Session = { ...base, game: withEvent(base.game!, ev.id) };
    expect(screenFor(queued)).toBe('event');
    const passage: Session = { ...queued, ui: { ...queued.ui, passageDay: queued.game!.day } };
    expect(screenFor(passage)).toBe('passage');
    const outcome: Session = { ...passage, ui: { ...passage.ui, outcome: { eventId: ev.id, optionId: 'x', entries: [] } } };
    expect(screenFor(outcome)).toBe('outcome');
    expect(screenFor(initialSession(content, 'ru'))).toBe('menu');
  });

  it('to_menu drops the game, load restores it with its language', () => {
    const s = withGame('morning');
    const menu = sessionReducer(s, { type: 'to_menu' });
    expect(screenFor(menu)).toBe('menu');
    const loaded = sessionReducer(menu, { type: 'load', game: { ...s.game!, lang: 'en' } });
    expect(loaded.lang).toBe('en');
    expect(screenFor(loaded)).toBe('morning');
  });
});
