import { boatOffers } from '../../../engine';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { BoatCard } from './BoatCard';
import styles from './Boat.module.css';
import { BOAT } from './strings';

export function BoatScreen() {
  const { game, content } = useGame();
  const act = useAct();
  const t = useT(BOAT);
  return (
    <ScreenFrame screen="boat" title={t('title')} subtitle={t('subtitle', { eur: game.resources.moneyEur })}>
      <div className={styles.grid}>
        {boatOffers(game, content).map(({ boat, affordable }) => (
          <BoatCard key={boat.id} boat={boat} affordable={affordable} onTake={() => act({ type: 'choose_boat', boatId: boat.id })} />
        ))}
      </div>
    </ScreenFrame>
  );
}
