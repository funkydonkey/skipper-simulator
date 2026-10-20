import type { Lang, VoiceImpact, VoiceReport } from '../../../engine';
import { VoiceIcon } from '../../components/voices/icons';
import { VOICE_NAMES } from '../../i18n/glossary';
import { makeT, type TFn } from '../../i18n/t';
import styles from './Debrief.module.css';
import { DEBRIEF, XP_ROOTS } from './strings';

const TOP_XP = 3;

/** One sentence per impact; null when it would read "nothing happened". */
function impactText(i: VoiceImpact, t: TFn<keyof typeof DEBRIEF>): string | null {
  switch (i.kind) {
    case 'risk': return i.avgDeltaPp === 0 ? null : t(i.avgDeltaPp < 0 ? 'impactRiskCut' : 'impactRiskUp', { n: Math.abs(i.avgDeltaPp), k: i.rolls });
    case 'checks': return i.passed + i.failed === 0 ? null : t('impactChecks', { n: i.passed, m: i.passed + i.failed });
    case 'saved_eur': return i.eur === 0 ? null : t('impactSaved', { n: i.eur });
    case 'front_warned': return i.days.length === 0 ? null : t('impactFront', { days: i.days.join(', ') });
    case 'softened': return i.mood === 0 ? null : t('impactSoftened', { n: i.mood });
  }
}

export function VoicesBlock({ voices, lang }: { voices: VoiceReport[]; lang: Lang }) {
  const t = makeT(DEBRIEF, lang);
  const cards = voices.flatMap((v) => {
    const sources = [...v.xp].sort((a, b) => b.xp - a.xp).slice(0, TOP_XP);
    const impacts = v.impacts.flatMap((i) => impactText(i, t) ?? []);
    return sources.length + impacts.length === 0 && v.startLevel === v.endLevel ? [] : [{ v, sources, impacts }];
  });
  if (cards.length === 0) return null;
  return (
    <section aria-labelledby="debrief-voices">
      <h2 id="debrief-voices" className={styles.h2}>{t('voices')}</h2>
      <ul className={styles.voices}>
        {cards.map(({ v, sources, impacts }) => (
          <li key={v.voice} className={styles.voice}>
            <strong className={styles.voiceName}><VoiceIcon voice={v.voice} /> {VOICE_NAMES[v.voice][lang]}</strong>
            <span className={styles.voiceLevel}>{t('levelRange', { from: v.startLevel, to: v.endLevel })}</span>
            {sources.length > 0 && (
              <p className={styles.voiceLine}>{t('xpFrom')} {sources.map((s) => `+${s.xp} ${XP_ROOTS[s.cause]?.[lang] ?? s.cause}`).join('; ')}</p>
            )}
            {impacts.map((text) => <p key={text} className={styles.voiceLine}>{text}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
