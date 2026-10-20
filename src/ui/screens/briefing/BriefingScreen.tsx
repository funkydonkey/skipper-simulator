import { useState } from 'react';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Briefing.module.css';
import { BRIEFING } from './strings';

const toggleIn = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

export function BriefingScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(BRIEFING);
  const { slots, maxDialogues } = content.balance.briefing;
  const [topics, setTopics] = useState<string[]>([]);
  const [lines, setLines] = useState<string[]>([]);
  const defects = content.boats.flatMap((b) => b.defectPool);
  const found = game.log
    .filter((e) => e.cause.startsWith('checkin:found:'))
    .map((e) => e.cause.split(':')[2])
    .filter((id) => game.defects.includes(id ?? ''))
    .map((id) => defects.find((d) => d.id === id)?.description[lang])
    .filter((d): d is string => Boolean(d));
  const dialogues = content.dialogues.filter((d) => d.contexts.includes('briefing'));

  return (
    <ScreenFrame
      screen="briefing"
      title={t('title')}
      subtitle={t('subtitle', { n: slots })}
      actions={<Button disabled={topics.length !== slots} onClick={() => act({ type: 'briefing', topicIds: topics, dialogueIds: lines })}>{t('start')}</Button>}
    >
      <p className={styles.found}>{found.length ? t('checkinFound', { list: found.join('; ') }) : t('checkinNothing')}</p>
      <section className={styles.table}>
        <h2>{t('crew')}</h2>
        <ul className={styles.crew}>
          {game.crew.map((m) => (
            <li key={m.id}>{m.name[lang]} · <em>{content.crew.find((a) => a.id === m.archetypeId)?.name[lang]}</em></li>
          ))}
        </ul>
      </section>
      <h2>{t('topics', { n: topics.length, max: slots })}</h2>
      <ul className={styles.topics}>
        {content.briefing.map((topic) => {
          const on = topics.includes(topic.id);
          return (
            <li key={topic.id}>
              <Button variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={!on && topics.length >= slots} onClick={() => setTopics((l) => toggleIn(l, topic.id))} className={styles.topic}>
                <strong>{topic.title[lang]}</strong>
                <span className={styles.desc}>{topic.description[lang]}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <h2>{t('lines', { max: maxDialogues })}</h2>
      <ul className={styles.lines}>
        {dialogues.map((d) => {
          const on = lines.includes(d.id);
          return (
            <li key={d.id}>
              <Button variant={on ? 'primary' : 'ghost'} aria-pressed={on} disabled={!on && lines.length >= maxDialogues} onClick={() => setLines((l) => toggleIn(l, d.id))}>
                «{d.said[lang]}»
              </Button>
              {on && <p className={styles.bubble}>{t('heard', { heard: d.heard[lang] })} · <span className="mono">{t('strength', { n: d.strength })}</span></p>}
            </li>
          );
        })}
      </ul>
    </ScreenFrame>
  );
}
