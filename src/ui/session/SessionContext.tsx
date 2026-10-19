import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { Content, GameState, Lang } from '../../engine';
import { makeT, type Dict, type TFn } from '../i18n/t';
import { initialSession, sessionReducer } from './reducer';
import { shouldAutosave, writeLangPref, writeSave } from './save';
import { screenKey } from './screen';
import type { Action, ActionBody, Session } from './types';

interface SessionValue { session: Session; dispatch: Dispatch<Action>; storage: Storage | null }
const SessionCtx = createContext<SessionValue | null>(null);

export interface SessionProviderProps {
  content: Content;
  storage: Storage | null;
  initialLang: Lang;
  initialGame?: GameState | null;
  children: ReactNode;
}

export function SessionProvider({ content, storage, initialLang, initialGame = null, children }: SessionProviderProps) {
  const [session, dispatch] = useReducer(sessionReducer, null, () => initialSession(content, initialLang, initialGame));
  const prevGame = useRef<GameState | null>(initialGame);
  useEffect(() => {
    if (session.game && shouldAutosave(prevGame.current, session.game)) writeSave(storage, session.game, new Date());
    prevGame.current = session.game;
  }, [session.game, storage]);
  useEffect(() => {
    document.documentElement.lang = session.lang;
    writeLangPref(storage, session.lang);
  }, [session.lang, storage]);
  const value = useMemo(() => ({ session, dispatch, storage }), [session, storage]);
  return <SessionCtx.Provider value={value}>{children}</SessionCtx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(SessionCtx);
  if (!v) throw new Error('useSession must be used inside SessionProvider');
  return v;
}

export const useLang = (): Lang => useSession().session.lang;

export function useT<K extends string>(d: Dict<K>): TFn<K> {
  const lang = useLang();
  return useMemo(() => makeT(d, lang), [d, lang]);
}

/** Dispatch tagged with the screen key it was rendered for: a second click on a stale screen is ignored. */
export function useAct(): (action: ActionBody) => void {
  const { session, dispatch } = useSession();
  const key = screenKey(session);
  return useCallback((action: ActionBody) => dispatch({ ...action, key }), [dispatch, key]);
}

export interface GameView { game: GameState; content: Content; lang: Lang }

export function useGame(): GameView {
  const { session } = useSession();
  if (!session.game) throw new Error('useGame needs a game in progress');
  return { game: session.game, content: session.content, lang: session.lang };
}
