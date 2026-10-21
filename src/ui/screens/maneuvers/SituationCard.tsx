import type { Lang, Situation } from '../../../engine';
import { ChanceBadge } from '../../components/ChanceBadge';
import { makeT } from '../../i18n/t';
import { BERTH_NAMES, SEABED_NAMES } from '../../view/strings';
import styles from './SituationCard.module.css';
import { SITUATION } from './strings';

export interface SituationCardProps { situation: Situation; lang: Lang }

/** What waits at the berth: wind side, marinero, seabed and room. A forecast says it may differ on arrival. */
export function SituationCard({ situation: s, lang }: SituationCardProps) {
  const t = makeT(SITUATION, lang);
  const side = t(`side_${s.windSide}`);
  const forecast = s.source === 'forecast';
  return (
    <section className={styles.card} data-situation={s.source} aria-label={t('title')}>
      <h2 className={styles.title}>{t('title')}</h2>
      {forecast && <p className={styles.forecast}>{t('forecast')}</p>}
      <dl className={styles.rows}>
        <dt>{t('berth')}</dt>
        <dd>{BERTH_NAMES[s.berth][lang]}</dd>
        <dt>{t('wind')}</dt>
        <dd>{s.windSide === 'none' ? side : t('windLine', { side, kn: s.windKn, dir: s.windDir })}</dd>
        <dt>{t('marinero')}</dt>
        <dd>
          {forecast && s.marineroOdds
            ? <span className={styles.chance}><span>{t('marineroChance')}</span> <ChanceBadge odds={s.marineroOdds} /></span>
            : t(s.marinero ? 'marineroYes' : 'marineroNo')}
        </dd>
        <dt>{t('place')}</dt>
        <dd><span>{t('seabed', { name: SEABED_NAMES[s.seabed][lang] })}</span>, <span>{t(s.tight ? 'tight' : 'roomy')}</span></dd>
      </dl>
    </section>
  );
}
