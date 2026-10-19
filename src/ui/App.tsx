import type { Content } from '../engine';
import { ErrorBanner } from './components/ErrorBanner';
import { LogbookDrawer } from './components/logbook/LogbookDrawer';
import { SCREENS } from './screens/registry';
import { SessionProvider, useSession } from './session/SessionContext';
import { readLangPref } from './session/save';
import { screenFor, screenKey } from './session/screen';

export function Shell() {
  const { session } = useSession();
  const Current = SCREENS[screenFor(session)];
  return (
    <div className="app" data-daytime="day">
      <ErrorBanner />
      <div className="screen" key={screenKey(session)}>
        <Current />
      </div>
      {session.game && <LogbookDrawer />}
    </div>
  );
}

export interface AppProps { content: Content; storage: Storage | null }

export function App({ content, storage }: AppProps) {
  const lang = readLangPref(storage) ?? (navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en');
  return (
    <SessionProvider content={content} storage={storage} initialLang={lang}>
      <Shell />
    </SessionProvider>
  );
}
