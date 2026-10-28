import { formatClock } from '../../engine';
import { COMMON } from '../i18n/common';
import { useGame, useT } from '../session/SessionContext';
import { pointName } from '../view/map';
import { damageSummary, resourceRows } from '../view/resources';
import { VIEW } from '../view/strings';
import styles from './ResourcePanel.module.css';

export function ResourcePanel() {
  const { game, content, lang } = useGame();
  const t = useT(VIEW);
  const tc = useT(COMMON);
  const rows = resourceRows(game, content, lang);
  return (
    <section className={styles.panel} aria-label={t('resources')}>
      <p className={styles.day}>{tc('dayOf', { n: Math.min(game.day, content.balance.schedule.days), total: content.balance.schedule.days })}</p>
      <p className={styles.where}>{t('at', { place: pointName(content, game.locationId, lang), clock: formatClock(game.clockMin) })}</p>
      <ul className={styles.list}>
        {rows.map((r) => (
          <li key={r.key} className={styles.row} data-level={r.level}>
            <span className={styles.label}>{r.label}</span>
            <span className={`${styles.value} mono`}>{r.value}</span>
            {r.share !== null && (
              <span className={styles.bar} aria-hidden="true">
                <span className={styles.fill} style={{ width: `${Math.max(0, Math.min(1, r.share)) * 100}%` }} />
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className={styles.damage}>{damageSummary(game, content, lang)}</p>
    </section>
  );
}
