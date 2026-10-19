import type { Boat } from '../../../engine';
import { Button } from '../../components/Button';
import { useLang, useT } from '../../session/SessionContext';
import styles from './Boat.module.css';
import { BOAT } from './strings';

export interface BoatCardProps { boat: Boat; affordable: boolean; onTake: () => void }

/** ТЗ 6.1: shiny features in big type, the things that decide the week in small print. */
export function BoatCard({ boat, affordable, onTake }: BoatCardProps) {
  const lang = useLang();
  const t = useT(BOAT);
  const name = boat.name[lang];
  const facts = [
    t('size', { ft: boat.lengthFt, cabins: boat.cabins, berths: boat.berths }),
    t('water', { l: boat.waterTankL }),
    t('fuel', { l: boat.fuelTankL, kn: boat.motorKn }),
    t('bank', { ah: boat.serviceBankAh, n: boat.serviceBanks }),
    boat.starterSeparate ? t('starterSeparate') : t('starterShared'),
    boat.solarW > 0 ? t('solar', { w: boat.solarW }) : t('noSolar'),
    boat.generator ? t('generator') : t('noGenerator'),
    boat.electricToilet ? t('electricToilet') : t('manualToilet'),
  ];
  return (
    <article className={styles.card} data-boat={boat.id} data-affordable={affordable}>
      <h2 className={styles.name}>{name}</h2>
      <ul className={styles.shiny}>
        {boat.shinyFeatures.map((f) => <li key={f.en}>{f[lang]}</li>)}
      </ul>
      <p className={styles.price}>{t('price', { eur: boat.priceEur })} · {t('deposit', { eur: boat.depositEur })}</p>
      <details className={styles.small} open>
        <summary>{t('smallPrint')}</summary>
        <ul>{facts.map((f) => <li key={f}>{f}</li>)}</ul>
      </details>
      <Button disabled={!affordable} onClick={onTake}>{t('take', { name })}</Button>
      {!affordable && <p className={styles.over}>{t('tooExpensive')}</p>}
    </article>
  );
}
