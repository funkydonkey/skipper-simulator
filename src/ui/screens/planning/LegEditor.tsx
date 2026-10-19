import { requireRoute, type LegPlan } from '../../../engine';
import { Button } from '../../components/Button';
import { FEATURE_NAMES } from '../../components/chart/strings';
import { useGame, useT } from '../../session/SessionContext';
import { pointName } from '../../view/map';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export interface LegEditorProps { legs: readonly LegPlan[]; trail: readonly string[]; onChange: (i: number, patch: Partial<LegPlan>) => void; onRemoveLast: () => void }

export function LegEditor({ legs, trail, onChange, onRemoveLast }: LegEditorProps) {
  const { content, lang } = useGame();
  const t = useT(PLANNING);
  if (legs.length === 0) return <p className={styles.muted}>{t('noLegs')}</p>;
  return (
    <section className={styles.legs}>
      <h2>{t('legs')}</h2>
      <ol>
        {legs.map((leg, i) => {
          const route = requireRoute(content, leg.routeId);
          const features = route.features.filter((f) => f !== 'open').map((f) => FEATURE_NAMES[f][lang]).join(', ');
          const name = `leg-${i}`;
          return (
            <li key={`${leg.routeId}-${i}`} className={styles.leg}>
              <p className={styles.legTitle}>
                {t('leg', { from: pointName(content, trail[i]!, lang), to: pointName(content, trail[i + 1]!, lang), nm: route.distanceNm })}
                {features && <em> · {features}</em>}
              </p>
              <div className={styles.row}>
                <label><input type="radio" name={`${name}-mode`} checked={leg.mode === 'motor'} onChange={() => onChange(i, { mode: 'motor' })} /> {t('motor')}</label>
                <label><input type="radio" name={`${name}-mode`} checked={leg.mode === 'sail'} onChange={() => onChange(i, { mode: 'sail' })} /> {t('sail')}</label>
              </div>
              {leg.mode === 'sail' && (
                <div className={styles.row}>
                  <label>{t('reefs')}{' '}
                    <select value={leg.reefs} onChange={(e) => onChange(i, { reefs: Number(e.target.value) as 0 | 1 | 2 })}>
                      {[0, 1, 2].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </label>
                  <select aria-label={t('genoaFull')} value={leg.genoa} onChange={(e) => onChange(i, { genoa: e.target.value as LegPlan['genoa'] })}>
                    <option value="full">{t('genoaFull')}</option>
                    <option value="partial">{t('genoaPartial')}</option>
                  </select>
                  <select aria-label={t('direct')} value={leg.course} onChange={(e) => onChange(i, { course: e.target.value as LegPlan['course'] })}>
                    <option value="direct">{t('direct')}</option>
                    <option value="detour">{t('detour')}</option>
                  </select>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <Button variant="ghost" onClick={onRemoveLast}>{t('removeLeg')}</Button>
    </section>
  );
}
