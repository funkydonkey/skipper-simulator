import { useState } from 'react';
import type { ManeuverKind } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import type { ManeuverOrders } from '../../session/types';
import { maneuversFor, shuffledStepIds } from './kinds';
import { ManeuverSketch } from './ManeuverSketch';
import styles from './Maneuvers.module.css';
import { OrderPicker } from './OrderPicker';
import { MANEUVERS } from './strings';

const SEED_DAY_STRIDE = 101;

export function ManeuversScreen() {
  const { game, content, lang } = useGame();
  const { session } = useSession();
  const act = useAct();
  const t = useT(MANEUVERS);
  const [orders, setOrders] = useState<ManeuverOrders>({});
  const plan = session.ui.draftPlan;
  if (!plan) return null;
  const specs = maneuversFor(game, content, plan);
  const complete = specs.every((s) => (orders[s.kind]?.length ?? 0) === s.maneuver.steps.length);
  const set = (kind: ManeuverKind) => (order: string[]) => setOrders((o) => ({ ...o, [kind]: order }));

  return (
    <ScreenFrame
      screen="maneuvers"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => act({ type: 'cancel_draft' })}>{t('back')}</Button>
          <Button disabled={!complete} onClick={() => act({ type: 'commit_plan', orders })}>{t('done')}</Button>
        </>
      )}
    >
      {specs.map((s, i) => (
        <section key={s.kind} className={styles.episode} data-kind={s.kind}>
          <header className={styles.head}>
            <ManeuverSketch kind={s.kind} />
            <div>
              <h2>{s.maneuver.title[lang]}</h2>
              {s.fallback && <p className={styles.fallback}>{t('fallback')}</p>}
            </div>
          </header>
          <OrderPicker
            maneuver={s.maneuver}
            pool={shuffledStepIds(s.maneuver, game.seed + game.day * SEED_DAY_STRIDE + i)}
            order={orders[s.kind] ?? []}
            onChange={set(s.kind)}
            {...(session.ui.lastOrders[s.kind] ? { lastOrder: session.ui.lastOrders[s.kind] } : {})}
          />
        </section>
      ))}
    </ScreenFrame>
  );
}
