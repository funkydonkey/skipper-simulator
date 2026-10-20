import { buildConditionContext, formatClock, presentEvent, requireEvent } from '../../../engine';
import { Button } from '../../components/Button';
import { ChanceBadge } from '../../components/ChanceBadge';
import { SceneArt } from '../../components/SceneArt';
import { ScreenFrame } from '../../components/ScreenFrame';
import { Typewriter } from '../../components/Typewriter';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { PILLAR_NAMES, VOICE_NAMES } from '../../i18n/glossary';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Event.module.css';
import { EVENT } from './strings';

export function EventScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(EVENT);
  const event = requireEvent(content, game.eventQueue[0] ?? '');
  const view = presentEvent(event, game, buildConditionContext(game, content), content.balance);
  return (
    <ScreenFrame screen="event" title={PILLAR_NAMES[event.pillar][lang]} subtitle={t('when', { day: game.day, clock: formatClock(game.clockMin) })}>
      <div className={styles.layout}>
        <SceneArt scene={view.scene} className={styles.scene} />
        <div className={styles.panel}>
          <Typewriter text={view.text} />
          <div className={styles.voices}>
            {view.voices.map((v, i) => <VoiceLine key={`${i}:${v.voice}`} voice={v.voice} text={v.text} />)}
          </div>
          <ol className={styles.options}>
            {view.options.map((o, i) => {
              const check = event.options[i]?.check;
              const showOdds = check !== undefined && o.chance !== null;
              const oddsId = `event-option-${o.id}-odds`;
              return (
                <li key={o.id} className={styles.optionRow}>
                  <Button variant="secondary" className={styles.option} disabled={!o.available} aria-describedby={showOdds ? oddsId : undefined} onClick={() => act({ type: 'resolve_event', optionId: o.id })}>
                    {o.text}
                    {!o.available && <span className={styles.na}> {t('unavailable')}</span>}
                  </Button>
                  {check && o.chance !== null && <ChanceBadge odds={o.chance} label={VOICE_NAMES[check.voice][lang]} voices={game.voices} id={oddsId} />}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </ScreenFrame>
  );
}
