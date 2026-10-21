import { repairOptions } from '../../../engine';
import { Button } from '../../components/Button';
import { ChanceBadge } from '../../components/ChanceBadge';
import { systemName } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './RepairBlock.module.css';
import { REPAIR } from './strings';

/** Every repair option of every broken system; hidden when nothing is broken. */
export function RepairBlock() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(REPAIR);
  const choices = repairOptions(game, content);
  if (choices.length === 0) return null;
  return (
    <section className={styles.block} aria-label={t('title')}>
      <h2 className={styles.title}>{t('title')}</h2>
      <ul className={styles.list}>
        {choices.map(({ systemId, option, available, reason, odds }) => (
          <li key={`${systemId}:${option.id}`} className={styles.row}>
            <span className={styles.system}>{systemName(content, systemId, lang)}</span>
            <div className={styles.facts}>
              <span>{t('cost', { eur: option.costEur ?? 0 })}</span>
              <span>{t('time', { h: option.timeHours ?? 0 })}</span>
              {odds && <ChanceBadge odds={odds} voices={game.voices} />}
            </div>
            <Button variant="secondary" disabled={!available} onClick={() => act({ type: 'repair', systemId, repairId: option.id })}>
              {option.label[lang]}
            </Button>
            {reason && <p className={styles.reason}>{t(reason)}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}
