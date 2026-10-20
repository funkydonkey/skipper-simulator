import { useState } from 'react';
import type { Lang } from '../../../engine';
import { Button } from '../../components/Button';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useLang, useSession, useT } from '../../session/SessionContext';
import { clearSave, readSave } from '../../session/save';
import styles from './Menu.module.css';
import { MENU } from './strings';

const SEED_RANGE = 2 ** 31;
const LANGS: readonly Lang[] = ['ru', 'en'];

function parseSeed(raw: string): number | null {
  const n = Number(raw.trim());
  return raw.trim() !== '' && Number.isInteger(n) && n >= 0 ? n : null;
}

export function MenuScreen() {
  const { session, storage } = useSession();
  const act = useAct();
  const lang = useLang();
  const t = useT(MENU);
  const tc = useT(COMMON);
  const [seedText, setSeedText] = useState('');
  const [save, setSave] = useState(() => readSave(storage, session.content));

  const startNew = (): void => act({ type: 'new_game', seed: parseSeed(seedText) ?? Math.floor(Math.random() * SEED_RANGE) });
  const when = save.kind === 'ok'
    ? new Date(save.savedAt).toLocaleString(lang === 'ru' ? 'ru-RU' : 'en-GB', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '';

  return (
    <ScreenFrame screen="menu" title={tc('appTitle')} subtitle={t('tagline')}>
      <SceneArt scene="marina_dawn" className={styles.scene} />
      <div className={styles.actions}>
        <Button onClick={startNew}>{t('newWeek')}</Button>
        <Button variant="secondary" disabled={save.kind !== 'ok'} onClick={() => save.kind === 'ok' && act({ type: 'load', game: save.game })}>
          {t('continue')}
        </Button>
        {save.kind === 'ok' && <p className={styles.saved}>{t('savedAt', { day: save.game.day, when })}</p>}
        {save.kind === 'legacy' && <p className={styles.corrupt}>{t('legacySave')}</p>}
        {save.kind === 'corrupt' && (
          <p className={styles.corrupt}>
            {t('corrupt')}{' '}
            <Button variant="ghost" onClick={() => { clearSave(storage); setSave({ kind: 'none' }); }}>{t('deleteSave')}</Button>
          </p>
        )}
      </div>
      <div className={styles.lang} role="group" aria-label={t('language')}>
        {LANGS.map((l) => (
          <Button key={l} variant={l === lang ? 'primary' : 'ghost'} aria-pressed={l === lang} onClick={() => act({ type: 'set_lang', lang: l })}>
            {l.toUpperCase()}
          </Button>
        ))}
      </div>
      <details className={styles.settings}>
        <summary>{t('settings')}</summary>
        <label className={styles.field}>
          <span>{t('seed')}</span>
          <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value)} />
        </label>
        <p className={styles.hint}>{t('seedHint')}</p>
      </details>
    </ScreenFrame>
  );
}
