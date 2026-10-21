import { renderText, type Resources } from '../../../engine';
import { Button } from '../../components/Button';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import { formatDuration, signed } from '../../view/format';
import { describeEntry, isLogbookOnly, isNoise } from '../../view/logbook';
import { RESOURCE_NAMES } from '../../view/strings';
import { sumDeltas, timeSpentHours } from './deltas';
import styles from './Event.module.css';
import { EVENT } from './strings';

export function OutcomeScreen() {
  const { game, content, lang } = useGame();
  const { session } = useSession();
  const act = useAct();
  const t = useT(EVENT);
  const tc = useT(COMMON);
  const outcome = session.ui.outcome;
  if (!outcome) return null;
  const event = content.events.find((e) => e.id === outcome.eventId);
  const option = event?.options.find((o) => o.id === outcome.optionId);
  const lines = outcome.entries.filter((e) => !isNoise(e) && !isLogbookOnly(e)).flatMap((e) => describeEntry(e, content, lang, game.seed, game.crew) ?? []);
  const deltas = Object.entries(sumDeltas(outcome.entries)) as [keyof Resources, number][];
  const hours = timeSpentHours(outcome.entries);
  return (
    <ScreenFrame screen="outcome" title={t('outcomeTitle')} subtitle={event && option ? renderText(option.text[lang], game, content, `${event.id}:${game.day}`) : undefined} actions={<Button onClick={() => act({ type: 'outcome_seen' })}>{tc('next')}</Button>}>
      <div className={styles.layout}>
        {event && <SceneArt scene={event.scene} className={styles.scene} />}
        <div className={styles.panel}>
          <ul className={styles.lines}>
            {lines.map((l, i) => <li key={i} data-tone={l.tone}>{l.text}</li>)}
          </ul>
          <h2 className={styles.h2}>{t('changes')}</h2>
          {deltas.length === 0 ? <p>{t('noChanges')}</p> : (
            <ul className={styles.chips}>
              {deltas.map(([k, v]) => <li key={k} data-sign={v > 0 ? 'plus' : 'minus'}>{RESOURCE_NAMES[k][lang]} <span className="mono">{signed(v)}</span></li>)}
            </ul>
          )}
          {hours > 0 && <p className="mono">{t('timeSpent', { time: formatDuration(hours, lang) })}</p>}
        </div>
      </div>
    </ScreenFrame>
  );
}
