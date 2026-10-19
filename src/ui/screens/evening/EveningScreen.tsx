import { useState } from 'react';
import { formatClock, requirePoint, tavernaOpen } from '../../../engine';
import { Button } from '../../components/Button';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import styles from '../day.module.css';
import { Expectations } from '../morning/Expectations';
import { EVENING } from './strings';

export function EveningScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(EVENING);
  const b = content.balance;
  const point = requirePoint(content, game.locationId);
  const facts = game.dayFacts;
  const open = tavernaOpen(game.clockMin, b);
  const tavernaReason = !point.services.taverna ? t('noTaverna') : !open ? t('tavernaClosed', { time: formatHour(b.time.tavernaCloseHour) }) : null;
  const [dinner, setDinner] = useState<'cook' | 'taverna'>('cook');
  const [line, setLine] = useState<string | null>(null);
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('evening'));
  const chosen = dialogues.find((d) => d.id === line);
  const summary = facts?.arrivalHour != null ? t('arrived', { time: formatHour(facts.arrivalHour) }) : t('stayed');
  const mooring = facts?.mooring === 'anchor' ? t('atAnchor') : t('atBerth');

  return (
    <ScreenFrame
      screen="evening"
      title={t('title', { n: game.day })}
      subtitle={t('subtitle', { place: point.name[lang], clock: formatClock(game.clockMin) })}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'end_day', choice: { dinner, dialogueId: line } })}>{t('sleep')}</Button>}
    >
      <p className={styles.summary}>{summary}, {mooring}.</p>
      <Expectations />
      <fieldset className={styles.say}>
        <legend>{t('dinner')}</legend>
        <label><input type="radio" name="dinner" checked={dinner === 'cook'} onChange={() => setDinner('cook')} /> {t('cook')}</label>
        {game.resources.gasPct < b.gas.pctPerDay && <p className={styles.warning}>{t('noGas')}</p>}
        <label>
          <input type="radio" name="dinner" checked={dinner === 'taverna'} disabled={tavernaReason !== null} onChange={() => setDinner('taverna')} />{' '}
          {t('taverna', { eur: game.crew.length * b.mood.tavernaEurPerPerson })}
        </label>
        {tavernaReason && <p className={styles.muted}>{tavernaReason}</p>}
      </fieldset>
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
