import type { Boat } from '../../../engine';
import { Button } from '../../components/Button';
import { SystemsPanel } from '../../components/SystemsPanel';
import { useGame, useT } from '../../session/SessionContext';
import styles from './Boat.module.css';
import { BOAT } from './strings';

export interface BoatCardProps { boat: Boat; affordable: boolean; onTake: () => void }

/** ТЗ 6.1: shiny features in big type, the things that decide the week in small print. */
export function BoatCard({ boat, affordable, onTake }: BoatCardProps) {
  const { content, lang } = useGame();
  const t = useT(BOAT);
  const name = boat.name[lang];
  const facts = [
    t('size', { ft: boat.lengthFt, cabins: boat.cabins, berths: boat.berths }),
    t('water', { l: boat.waterTankL }),
    t('fuel', { l: boat.fuelTankL, kn: boat.motorKn, lph: boat.motorLph ?? content.balance.fuel.motorLph }),
    t('bank', { ah: boat.serviceBankAh, n: boat.serviceBanks }),
    boat.starterSeparate ? t('starterSeparate') : t('starterShared'),
    boat.solarW > 0 ? t('solar', { w: boat.solarW }) : t('noSolar'),
    boat.electricToilet ? t('electricToilet') : t('manualToilet'),
  ];
  return (
    <article className={styles.card} data-boat={boat.id} data-affordable={affordable}>
      <h2 className={styles.name}>{name}</h2>
      <ul className={styles.shiny}>
        {boat.shinyFeatures.map((f) => <li key={f.en}>{f[lang]}</li>)}
      </ul>
      <p className={styles.weakness}>{boat.weakness[lang]}</p>
      <p className={styles.price}>{t('price', { eur: boat.priceEur })} · {t('deposit', { eur: boat.depositEur })}</p>
      <details className={styles.small} open>
        <summary>{t('smallPrint')}</summary>
        <ul>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
        <SystemsPanel systems={Object.fromEntries(Object.entries(boat.systems).map(([id, state]) => [id, { state }]))} content={content} lang={lang} />
      </details>
      <Button disabled={!affordable} onClick={onTake}>{t('take', { name })}</Button>
      {!affordable && <p className={styles.over}>{t('tooExpensive')}</p>}
    </article>
  );
}
