import { returnDepositLoss } from '../../../engine';
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { DAMAGE_NAMES, label } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour, money } from '../../view/format';
import styles from '../day.module.css';
import { RETURN } from './strings';

export function ReturnScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(RETURN);
  const { returnDeadlineHour, lateFeeEur } = content.balance.schedule;
  const time = formatHour(returnDeadlineHour);
  const arrival = game.log.find((e) => e.cause === 'return:on_time')?.data?.arrivalHour;
  const kept = returnDepositLoss(game, content);
  return (
    <ScreenFrame screen="return" title={t('title')} side={<ResourcePanel />} actions={<Button onClick={() => act({ type: 'finish_week' })}>{t('handover')}</Button>}>
      <p className={game.returnedOnTime ? styles.summary : styles.warning}>
        {game.returnedOnTime ? (typeof arrival === 'number' ? t('onTime', { time: formatHour(arrival) }) : t('onTimeNoClock', { time })) : t('late', { time, eur: lateFeeEur })}
      </p>
      <p className={kept > 0 ? styles.warning : styles.summary}>{kept > 0 ? t('managerKept', { eur: money(kept, lang) }) : t('managerPleased')}</p>
      <h2>{t('damages')}</h2>
      {game.damages.length === 0 ? <p className={styles.muted}>{t('noDamage')}</p> : (
        <ul>{game.damages.map((d) => <li key={d}>{label(DAMAGE_NAMES, d, lang)}</li>)}</ul>
      )}
    </ScreenFrame>
  );
}
