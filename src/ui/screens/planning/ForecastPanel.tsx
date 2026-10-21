import { forecastInsight } from '../../../engine';
import { WindRose } from '../../components/WindRose';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour, signed } from '../../view/format';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export function ForecastPanel() {
  const { game, content, lang } = useGame();
  const template = content.weather.find((x) => x.id === game.weatherTemplateId);
  const t = useT(PLANNING);
  const w = game.weather;
  if (!w) return null;
  const insight = forecastInsight(game, content);
  return (
    <section className={styles.forecast}>
      <h2>{t('forecast')}</h2>
      {template && <p className={styles.muted}>{t('weekTemplate', { name: template.name[lang] })}</p>}
      <WindRose dir={w.forecastDir} kn={w.forecastKn} gustKn={w.forecastGustKn} />
      <p>{t('forecastWind', { kn: w.forecastKn, gust: w.forecastGustKn, dir: w.forecastDir })}</p>
      {w.signalsVisible ? (
        <>
          <p className="mono">{w.barometerTrendHpa === 0 ? t('steady', { hpa: w.barometerHpa }) : t('trend', { hpa: w.barometerHpa, trend: signed(w.barometerTrendHpa) })}</p>
          {w.front ? <VoiceLine voice="sea_sense" text={t('frontSigns')} /> : <p className={styles.muted}>{t('noFront')}</p>}
        </>
      ) : (
        <>
          <p className="mono">{t('barometer', { hpa: w.barometerHpa })}</p>
          <p className={styles.muted}>{t('noBarometer')}</p>
        </>
      )}
      {insight.frontChance !== null && <p className={styles.insight}>{t('insightChance', { pct: Math.round(insight.frontChance * 100) })}</p>}
      {insight.frontFromHour !== null && <p className={styles.insight}>{t('insightFrom', { time: formatHour(insight.frontFromHour) })}</p>}
    </section>
  );
}
