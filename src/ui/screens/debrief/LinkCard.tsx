import { formatClock, type DebriefLink, type LogEntry } from '../../../engine';
import { PILLAR_NAMES } from '../../i18n/glossary';
import { useGame, useT } from '../../session/SessionContext';
import { describeEntry } from '../../view/logbook';
import styles from './Debrief.module.css';
import { DEBRIEF } from './strings';

export function LinkCard({ link }: { link: DebriefLink }) {
  const { game, content, lang } = useGame();
  const t = useT(DEBRIEF);
  const row = (title: string, e: LogEntry) => (
    <p className={styles.step}>
      <strong>{title}:</strong> {describeEntry(e, content, lang, game.seed)?.text ?? e.cause}{' '}
      <span className={`${styles.stamp} mono`}>({t('stamp', { day: e.day, clock: formatClock(e.clockMin) })})</span>
    </p>
  );
  return (
    <article className={styles.link} data-pillar={link.pillar}>
      <span className={styles.pillar}>{PILLAR_NAMES[link.pillar][lang]}</span>
      <p className={styles.note}>{link.text[lang]}</p>
      {row(t('decision'), link.decision)}
      {row(t('consequence'), link.consequence)}
      {link.signal && row(t('signal'), link.signal)}
    </article>
  );
}
