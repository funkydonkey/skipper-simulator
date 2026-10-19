import type { ShowerDiscipline } from '../../../engine';
import { useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { SHOWER_NAMES } from '../../view/strings';
import type { Draft } from './planDraft';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

const SHOWERS: readonly ShowerDiscipline[] = ['strict', 'normal', 'loose'];

export interface DaySettingsProps { draft: Draft; departures: readonly number[]; onChange: (patch: Partial<Draft>) => void }

export function DaySettings({ draft, departures, onChange }: DaySettingsProps) {
  const { content, lang } = useGame();
  const t = useT(PLANNING);
  const maxSwims = content.balance.time.maxSwimStops;
  return (
    <section className={styles.settings}>
      <h2>{t('day')}</h2>
      {draft.legs.length > 0 && (
        <label>{t('departure')}{' '}
          <select value={draft.departureHour} onChange={(e) => onChange({ departureHour: Number(e.target.value) })}>
            {departures.map((h) => <option key={h} value={h}>{formatHour(h)}</option>)}
          </select>
        </label>
      )}
      <label>{t('swims')}{' '}
        <select value={draft.swimStops} onChange={(e) => onChange({ swimStops: Number(e.target.value) })}>
          {Array.from({ length: maxSwims + 1 }, (_, n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <fieldset className={styles.row}>
        <legend>{t('shower')}</legend>
        {SHOWERS.map((s) => (
          <label key={s}><input type="radio" name="shower" checked={draft.shower === s} onChange={() => onChange({ shower: s })} /> {SHOWER_NAMES[s][lang]}</label>
        ))}
      </fieldset>
      {draft.legs.length > 0 && (
        <label><input type="checkbox" checked={draft.autopilot} onChange={(e) => onChange({ autopilot: e.target.checked })} /> {t('autopilot')}</label>
      )}
    </section>
  );
}
