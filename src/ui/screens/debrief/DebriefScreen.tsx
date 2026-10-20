import { useEffect } from 'react';
import { buildDebrief, type Grade } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { clearSave } from '../../session/save';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import styles from './Debrief.module.css';
import { GradeMark } from './GradeMark';
import { LinkCard } from './LinkCard';
import { DEBRIEF } from './strings';
import { VoicesBlock } from './VoicesBlock';

const SEED_RANGE = 2 ** 31;

export function DebriefScreen() {
  const { game, content, lang } = useGame();
  const { storage } = useSession();
  const act = useAct();
  const t = useT(DEBRIEF);
  const tc = useT(COMMON);
  useEffect(() => clearSave(storage), [storage]);
  const d = buildDebrief(game, content);
  const scales: Array<[keyof typeof d.scales, Grade, string]> = [
    ['safety', d.scales.safety, game.injuries > 0 ? t('injuries', { n: game.injuries }) : t('noInjuries')],
    ['crew', d.scales.crew, t('mood', { n: Math.round(game.resources.mood) })],
    ['boat', d.scales.boat, t('deposit', { returned: d.depositReturnedEur, loss: d.depositLossEur })],
    ['schedule', d.scales.schedule, game.returnedOnTime ? t('onTime') : t('late')],
  ];
  return (
    <ScreenFrame
      screen="debrief"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => act({ type: 'to_menu' })}>{tc('menu')}</Button>
          <Button variant="secondary" onClick={() => act({ type: 'new_game', seed: Math.floor(Math.random() * SEED_RANGE) })}>{t('newWeek')}</Button>
          <Button onClick={() => act({ type: 'new_game', seed: game.seed })}>{t('replay')}</Button>
        </>
      )}
    >
      <div className={styles.scales}>
        {scales.map(([key, grade, detail]) => (
          <section key={key} className={styles.scale} data-grade={grade}>
            <h2>{t(key)}</h2>
            <GradeMark grade={grade} />
            <p>{detail}</p>
          </section>
        ))}
      </div>
      <VoicesBlock voices={d.voices} lang={lang} />
      <h2 className={styles.h2}>{t('links')}</h2>
      <div className={styles.links}>{d.links.map((l) => <LinkCard key={l.ruleId} link={l} />)}</div>
      {d.eventNotes.length > 0 && (
        <>
          <h2 className={styles.h2}>{t('notes')}</h2>
          <ul className={styles.notes}>{d.eventNotes.map((n) => <li key={n.en}>{n[lang]}</li>)}</ul>
        </>
      )}
    </ScreenFrame>
  );
}
