import { useState, type KeyboardEvent } from 'react';
import { COMMON } from '../../i18n/common';
import { useSession, useT } from '../../session/SessionContext';
import { logbookDays } from '../../view/logbook';
import { Button } from '../Button';
import { ChanceBadge } from '../ChanceBadge';
import { LangSwitch } from './LangSwitch';
import styles from './Logbook.module.css';
import { LOGBOOK } from './strings';

export function LogbookDrawer() {
  const { session } = useSession();
  const [open, setOpen] = useState(false);
  const t = useT(LOGBOOK);
  const tc = useT(COMMON);
  const game = session.game;
  if (!game) return null;
  const days = open ? logbookDays(game.log, session.content, session.lang, game.seed, game.day, game.crew) : [];
  const onKey = (e: KeyboardEvent<HTMLDivElement>): void => { if (e.key === 'Escape') setOpen(false); };
  return (
    <>
      <Button variant="secondary" className={styles.toggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>{tc('logbook')}</Button>
      {open && (
        <div role="dialog" aria-label={tc('logbook')} className={styles.drawer} data-surface="paper" onKeyDown={onKey} tabIndex={-1} ref={(el) => el?.focus()}>
          <header className={styles.head}>
            <h2>{tc('logbook')}</h2>
            <LangSwitch />
            <Button variant="ghost" onClick={() => setOpen(false)}>{tc('dismiss')}</Button>
          </header>
          {days.length === 0 && <p>{t('empty')}</p>}
          {days.map((d) => (
            <section key={d.day}>
              <h3 className={styles.day}>{d.day === 0 ? t('dayZero') : tc('day', { n: d.day })}</h3>
              <ol className={styles.lines}>
                {d.lines.map((l, i) => (
                  <li key={i} data-tone={l.tone}><span className="mono">{l.clock}</span> {l.text}{l.odds && <ChanceBadge odds={l.odds} />}</li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
