import { formatClock, type BerthType, type PlanPreview } from '../../../engine';
import { ChanceBadge } from '../../components/ChanceBadge';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import { BERTH_NAMES, SEABED_NAMES } from '../../view/strings';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

const round1 = (n: number): number => Math.round(n * 10) / 10;

interface PreviewPanelProps { preview: PlanPreview; berth?: BerthType | undefined; onBerth: (berth: BerthType) => void }

export function PreviewPanel({ preview, berth, onBerth }: PreviewPanelProps) {
  const { game, content, lang } = useGame();
  const t = useT(PLANNING);
  const b = content.balance;
  const lastDay = game.day === b.schedule.days;
  const warnings: string[] = [];
  if (preview.arrivalAfterSunset) warnings.push(t('afterSunset'));
  if (!preview.marinaAffordable) warnings.push(t('marinaNoMoney'));
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
                {l.breakChance.value > 0 && <div className={styles.odds}>{t('sailRisk')} <ChanceBadge odds={l.breakChance} voices={game.voices} /></div>}
                {l.tow && <p className={styles.warn}>{t('legTow', { eur: l.tow.eur, hours: l.tow.hours })}</p>}
                {!l.tow && l.mode !== l.plannedMode && <p className={styles.warn}>{t(l.mode === 'sail' ? 'legNoMotor' : 'legNoSail')}</p>}
                {l.overpowered && <p className={styles.warn}>{t('overpowered')}</p>}
                {l.forcedReef && <p className={styles.warn}>{t('forcedReef')}</p>}
              </li>
            ))}
          </ul>
          {preview.berths.length > 1 && (
            <div role="radiogroup" aria-label={t('berthTitle')} className={styles.berths}>
              {preview.berths.map((type) => {
                const fee = preview.berthFees[type];
                const feeText = fee === undefined ? null : type === 'side_to' ? t('berthFeeFactor', { eur: fee, factor: lang === 'ru' ? String(b.berths.sideToPriceFactor).replace('.', ',') : b.berths.sideToPriceFactor }) : t('berthFee', { eur: fee });
                return (
                  <label key={type}>
                    <input type="radio" name="berth" checked={type === (berth ?? preview.berths[0])} onChange={() => onBerth(type)} />
                    {BERTH_NAMES[type][lang]}
                    {feeText && <span className={styles.muted}> {feeText}</span>}
                    {type === 'anchor_ashore' && <span className={styles.muted}> {t('berthNoteAnchorAshore')}</span>}
                  </label>
                );
              })}
            </div>
          )}
          {preview.marinaRefusal && preview.marinaRefusal.value > 0 && <div className={styles.odds}>{t('marinaRefusal')} <ChanceBadge odds={preview.marinaRefusal} voices={game.voices} /></div>}
          {preview.anchorFail && (
            <div className={styles.odds}>
              {t('seabed', { name: SEABED_NAMES[preview.destinationSeabed][lang] })} <ChanceBadge odds={preview.anchorFail} label={t('anchorFail')} voices={game.voices} />
            </div>
          )}
        </>
      )}
      {warnings.map((w) => <p key={w} className={styles.warn}>{w}</p>)}
      <p className={styles.muted}>{t('rest', { h: round1(preview.restHours) })}</p>
    </section>
  );
}
