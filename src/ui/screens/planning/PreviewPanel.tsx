import { formatClock, type PlanPreview } from '../../../engine';
import { ChanceBadge } from '../../components/ChanceBadge';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import { SEABED_NAMES } from '../../view/strings';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

const round1 = (n: number): number => Math.round(n * 10) / 10;

export function PreviewPanel({ preview }: { preview: PlanPreview }) {
  const { game, content, lang } = useGame();
  const t = useT(PLANNING);
  const b = content.balance;
  const lastDay = game.day === b.schedule.days;
  const warnings: string[] = [];
  if (preview.arrivalAfterSunset) warnings.push(t('afterSunset'));
  if (preview.marinaLate) warnings.push(t('marinaLate'));
  if (lastDay && content.map.find((p) => p.id === preview.destinationId)?.kind !== 'base') warnings.push(t('mustReturn'));
  if (lastDay && preview.arrivalMin !== null && preview.arrivalMin > b.schedule.returnDeadlineHour * 60) warnings.push(t('tooLateForBase', { time: formatHour(b.schedule.returnDeadlineHour) }));
  if (preview.fuelNeededL > game.resources.fuelL) warnings.push(t('fuelShort', { need: Math.ceil(preview.fuelNeededL) }));
  return (
    <section className={styles.preview} aria-live="polite">
      <h2>{t('preview')}</h2>
      {preview.departureMin === null || preview.arrivalMin === null ? <p>{t('stayRest')}</p> : (
        <>
          <p className={styles.times}>{t('times', { dep: formatClock(preview.departureMin), arr: formatClock(preview.arrivalMin) })}</p>
          <ul className={styles.legPreviews}>
            {preview.legs.map((l, i) => (
              <li key={`${l.routeId}-${i}`}>
                {t('legPreview', { to: pointName(content, l.to, lang), wind: l.windKn, speed: l.speedKn, hours: round1(l.hours) })}
                {l.localEffectKnown && <em> {t('localKnown')}</em>}
                {l.breakChance.value > 0 && <p className={styles.odds}>{t('sailRisk')} <ChanceBadge odds={l.breakChance} /></p>}
                {l.overpowered && <p className={styles.warn}>{t('overpowered')}</p>}
                {l.forcedReef && <p className={styles.warn}>{t('forcedReef')}</p>}
              </li>
            ))}
          </ul>
          {preview.marinaRefusal && preview.marinaRefusal.value > 0 && <p className={styles.odds}>{t('marinaRefusal')} <ChanceBadge odds={preview.marinaRefusal} /></p>}
          {preview.anchorFail && (
            <p className={styles.odds}>
              {t('seabed', { name: SEABED_NAMES[preview.destinationSeabed][lang] })} <ChanceBadge odds={preview.anchorFail} label={t('anchorFail')} />
            </p>
          )}
        </>
      )}
      {warnings.map((w) => <p key={w} className={styles.warn}>{w}</p>)}
      <p className={styles.muted}>{t('rest', { h: round1(preview.restHours) })}</p>
    </section>
  );
}
