import { useGame, useT } from '../../session/SessionContext';
import styles from '../day.module.css';
import { MORNING } from './strings';

/** Open expectations as the crew heard them (ТЗ 4.7); `hide` drops ones shown elsewhere (judged today). */
export function Expectations({ hide = [] }: { hide?: readonly string[] }) {
  const { game, content, lang } = useGame();
  const t = useT(MORNING);
  const open = game.expectations.filter((e) => e.status === 'open' && !hide.includes(e.id));
  if (open.length === 0) return <p className={styles.muted}>{t('nothingExpected')}</p>;
  return (
    <section className={styles.expect}>
      <h2>{t('expecting')}</h2>
      <ul>
        {open.map((e) => <li key={`${e.id}:${e.dueDay}`} className={styles.bubble}>«{content.dialogues.find((d) => d.id === e.dialogueId)?.heard[lang] ?? e.dialogueId}»</li>)}
      </ul>
    </section>
  );
}
