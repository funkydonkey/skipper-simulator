import { buildConditionContext, formatClock, presentEvent, requireEvent } from '../../../engine';
import { Button } from '../../components/Button';
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
            {view.voices.map((v) => <VoiceLine key={v.voice} voice={v.voice} text={v.text} />)}
          </div>
          <ol className={styles.options}>
            {view.options.map((o, i) => {
              const check = event.options[i]?.check;
              return (
                <li key={o.id}>
                  <Button variant="secondary" className={styles.option} disabled={!o.available} onClick={() => act({ type: 'resolve_event', optionId: o.id })}>
                    {o.text}
                    {check && o.chance !== null && <span className={`${styles.odds} mono`}> {t('check', { voice: VOICE_NAMES[check.voice][lang], pct: Math.round(o.chance * 100) })}</span>}
                    {!o.available && <span className={styles.na}> {t('unavailable')}</span>}
                  </Button>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </ScreenFrame>
  );
}
