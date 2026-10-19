import { act, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Dispatch, ReactNode } from 'react';
import type { GameState, Lang } from '../../src/engine';
import { Shell } from '../../src/ui/App';
import { SessionProvider, useSession } from '../../src/ui/session/SessionContext';
import { memoryStorage } from '../../src/ui/session/save';
import type { Action, Session } from '../../src/ui/session/types';
import { content } from './fixtures';

export interface RenderOptions { lang?: Lang; storage?: Storage }

/**
 * Mounts the real Shell with a ready GameState.
 * `session()` returns the latest session; `dispatch()` sends an action as if a screen did.
 */
export function renderShell(game: GameState | null, opts: RenderOptions = {}) {
  const storage = opts.storage ?? memoryStorage();
  const user = userEvent.setup();
  const latest: { session: Session | null; dispatch: Dispatch<Action> | null } = { session: null, dispatch: null };
  function Probe() {
    const v = useSession();
    latest.session = v.session;
    latest.dispatch = v.dispatch;
    return null;
  }
  const view = render(
    <SessionProvider content={content} storage={storage} initialLang={opts.lang ?? 'ru'} initialGame={game}>
      <Probe />
      <Shell />
    </SessionProvider>,
  );
  const currentScreen = (): string | null => view.container.querySelector('[data-screen]')?.getAttribute('data-screen') ?? null;
  const session = (): Session => {
    if (!latest.session) throw new Error('session not rendered');
    return latest.session;
  };
  const dispatch = (action: Action): void => {
    act(() => latest.dispatch?.(action));
  };
  return { ...view, user, storage, currentScreen, session, dispatch };
}

/** Renders any node inside a SessionProvider (components that need the language or a game). */
export function renderWithSession(node: ReactNode, game: GameState | null = null, lang: Lang = 'ru') {
  const user = userEvent.setup();
  const view = render(
    <SessionProvider content={content} storage={memoryStorage()} initialLang={lang} initialGame={game}>{node}</SessionProvider>,
  );
  return { ...view, user };
}
