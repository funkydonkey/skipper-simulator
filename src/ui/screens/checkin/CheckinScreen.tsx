import { useState } from 'react';
import { CHECKPOINTS, type CheckpointId } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { CHECKPOINT_NAMES } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Checkin.module.css';
import { CHECKIN } from './strings';
import { YachtCutaway } from './YachtCutaway';

export function CheckinScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(CHECKIN);
  const { budgetMin, costMin } = content.balance.checkin;
  const [checked, setChecked] = useState<ReadonlySet<CheckpointId>>(new Set());
  const used = [...checked].reduce((sum, id) => sum + costMin[id], 0);
  const disabled = new Set(CHECKPOINTS.filter((id) => !checked.has(id) && used + costMin[id] > budgetMin));
  const fixMins = content.boats.find((b) => b.id === game.boatId)?.defectPool.flatMap((d) => (d.system && d.fixMin ? [d.fixMin] : [])) ?? [];
  const toggle = (id: CheckpointId): void => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <ScreenFrame
      screen="checkin"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={<Button onClick={() => act({ type: 'checkin', checkpoints: [...checked] })}>{t('finish')}</Button>}
    >
      <p className={styles.budget}>{t('budget', { used, total: budgetMin })}</p>
      <div className={styles.meter} aria-hidden="true"><span style={{ width: `${(used / budgetMin) * 100}%` }} /></div>
      <p className={styles.note}>{fixMins.length > 0 ? t('repairTime', { n: Math.min(...fixMins) }) : t('repairTimeAny')}</p>
      <YachtCutaway checked={checked} disabled={disabled} onToggle={toggle} label={t('cutaway')} />
      <ul className={styles.points}>
        {CHECKPOINTS.map((id) => (
          <li key={id}>
            <Button variant={checked.has(id) ? 'primary' : 'secondary'} aria-pressed={checked.has(id)} disabled={disabled.has(id)} onClick={() => toggle(id)}>
              {CHECKPOINT_NAMES[id][lang]} · <span className="mono">{t('cost', { n: costMin[id] })}</span>
            </Button>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
