import type { Lang } from '../../../engine';
import { useSession, useT } from '../../session/SessionContext';
import { Button } from '../Button';
import styles from './Logbook.module.css';
import { LOGBOOK } from './strings';

const LANGS: readonly Lang[] = ['ru', 'en'];

/** RU/EN mid-game. set_lang is idempotent and screen-independent, so it goes through raw dispatch. */
export function LangSwitch() {
  const { session, dispatch } = useSession();
  const t = useT(LOGBOOK);
  return (
    <div className={styles.langs} role="group" aria-label={t('language')}>
      {LANGS.map((l) => (
        <Button key={l} variant={l === session.lang ? 'primary' : 'ghost'} aria-pressed={l === session.lang} onClick={() => dispatch({ type: 'set_lang', lang: l })}>
          {l.toUpperCase()}
        </Button>
      ))}
    </div>
  );
}
