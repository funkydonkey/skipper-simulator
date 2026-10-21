import { useState } from 'react';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { systemName } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Defects.module.css';
import { DEFECTS } from './strings';

export function DefectsScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(DEFECTS);
  const boat = content.boats.find((b) => b.id === game.boatId);
  const found = (game.checkin?.found ?? []).flatMap((id) => boat?.defectPool.find((d) => d.id === id) ?? []);
  const [fixIds, setFixIds] = useState<readonly string[]>([]);
  const minutesOf = (id: string): number => found.find((d) => d.id === id)?.fixMin ?? 0;
  const left = (game.checkin?.minutesLeft ?? 0) - fixIds.reduce((sum, id) => sum + minutesOf(id), 0);
  const toggle = (id: string): void => setFixIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <ScreenFrame
      screen="defects"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={<Button onClick={() => act({ type: 'resolve_defects', fixIds: [...fixIds] })}>{fixIds.length ? t('confirm') : t('sailOn')}</Button>}
    >
      <p className={styles.left}>{t('minutesLeft', { n: left })}</p>
      <ul className={styles.list}>
        {found.map((d) => {
          const fixable = d.system !== undefined && d.fixEur !== undefined && d.fixMin !== undefined;
          const chosen = fixIds.includes(d.id);
          const noTime = fixable && !chosen && (d.fixMin ?? 0) > left;
          return (
            <li key={d.id} className={styles.item}>
              <p>{d.description[lang]}</p>
              {d.system && <p className={styles.system}>{t('system', { name: systemName(content, d.system, lang) })}</p>}
              {fixable && (
                <>
                  <Button variant={chosen ? 'primary' : 'secondary'} aria-pressed={chosen} disabled={noTime} onClick={() => toggle(d.id)}>
                    {t('fix', { eur: d.fixEur ?? 0, min: d.fixMin ?? 0 })}
                  </Button>
                  {noTime ? <p className={styles.reason}>{t('noTime')}</p> : !chosen && <p className={styles.choice}>{t('sailOn')}</p>}
                </>
              )}
            </li>
          );
        })}
      </ul>
    </ScreenFrame>
  );
}
