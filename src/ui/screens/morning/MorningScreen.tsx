import { useState } from 'react';
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { VoiceLine } from '../../components/voices/VoiceLine';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import styles from '../day.module.css';
import { Expectations } from './Expectations';
import { MORNING } from './strings';

export function MorningScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(MORNING);
  const [barometer, setBarometer] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const b = content.balance;
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('morning'));
  const chosen = dialogues.find((d) => d.id === line);

  return (
    <ScreenFrame
      screen="morning"
      title={t('title', { n: game.day })}
      subtitle={pointName(content, game.locationId, lang)}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'start_day', choice: { openBarometer: barometer, dialogueId: line } })}>{t('start')}</Button>}
    >
      {game.day === b.schedule.days && <p className={styles.warning}>{t('lastDay', { time: formatHour(b.schedule.returnDeadlineHour) })}</p>}
      <Expectations />
      <label className={styles.check}>
        <input type="checkbox" checked={barometer} onChange={(e) => setBarometer(e.target.checked)} />
        {t('barometer')}
      </label>
      {game.voices.sea_sense >= b.voices.seaSenseSignalLevel && <VoiceLine voice="sea_sense" text={t('seaSense')} />}
      <fieldset className={styles.say}>
        <legend>{t('say')}</legend>
        <label><input type="radio" name="say" checked={line === null} onChange={() => setLine(null)} /> {t('sayNothing')}</label>
        {dialogues.map((d) => (
          <label key={d.id}><input type="radio" name="say" checked={line === d.id} onChange={() => setLine(d.id)} /> «{d.said[lang]}»</label>
        ))}
      </fieldset>
      {chosen && <p className={styles.bubble}>{t('heard', { heard: chosen.heard[lang] })}</p>}
    </ScreenFrame>
  );
}
