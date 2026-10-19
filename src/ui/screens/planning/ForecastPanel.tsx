import { WindRose } from '../../components/WindRose';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { useGame, useT } from '../../session/SessionContext';
import { signed } from '../../view/format';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export function ForecastPanel() {
  const { game } = useGame();
  const t = useT(PLANNING);
  const w = game.weather;
  if (!w) return null;
  return (
    <section className={styles.forecast}>
      <h2>{t('forecast')}</h2>
      <WindRose dir={w.forecastDir} kn={w.forecastKn} gustKn={w.forecastGustKn} />
      <p>{t('forecastWind', { kn: w.forecastKn, gust: w.forecastGustKn, dir: w.forecastDir })}</p>
      {w.signalsVisible ? (
        <>
          <p className="mono">{t('trend', { hpa: w.barometerHpa, trend: signed(w.barometerTrendHpa) })}</p>
          {w.front && <VoiceLine voice="sea_sense" text={t('frontSigns')} />}
        </>
      ) : (
        <>
          <p className="mono">{t('barometer', { hpa: w.barometerHpa })}</p>
          <p className={styles.muted}>{t('noBarometer')}</p>
        </>
      )}
    </section>
  );
}
