import type { Lang, VoiceImpact, VoiceReport } from '../../../engine';
import { VoiceIcon } from '../../components/voices/icons';
import { VOICE_NAMES } from '../../i18n/glossary';
import { makeT, type TFn } from '../../i18n/t';
import { money } from '../../view/format';
import styles from './Debrief.module.css';
import { DEBRIEF, XP_ROOT_OTHER, XP_ROOTS } from './strings';

const TOP_XP = 3;

/** One sentence per impact; null when it would read "nothing happened". */
function impactText(i: VoiceImpact, t: TFn<keyof typeof DEBRIEF>, lang: Lang): string | null {
  switch (i.kind) {
    case 'risk': return i.avgDeltaPp === 0 ? null : t(i.avgDeltaPp < 0 ? 'impactRiskCut' : 'impactRiskUp', { n: Math.abs(i.avgDeltaPp), k: i.rolls });
    case 'checks': return i.passed + i.failed === 0 ? null : t('impactChecks', { n: i.passed, m: i.passed + i.failed });
    case 'saved_eur': return i.eur === 0 ? null : t('impactSaved', { n: money(i.eur, lang) });
    case 'front_warned': return i.days.length === 0 ? null : t('impactFront', { days: i.days.join(', ') });
    case 'softened': return i.mood === 0 ? null : t('impactSoftened', { n: i.mood });
  }
}

/** Roots are two segments (`fault:<system>`); a root may also be labelled by its first segment alone. */
const xpRootLabel = (cause: string, lang: Lang): string => {
  const key = [cause, cause.split(':')[0] ?? ''].find((k) => Object.hasOwn(XP_ROOTS, k));
  return (key ? XP_ROOTS[key]! : XP_ROOT_OTHER)[lang];
};

/** XP grouped by its readable label (unknown roots fold into «other»), biggest first, top three. */
function topSources(xp: VoiceReport['xp'], lang: Lang): Array<{ label: string; xp: number }> {
  const byLabel = xp.reduce((acc, s) => {
    const label = xpRootLabel(s.cause, lang);
    return acc.set(label, (acc.get(label) ?? 0) + s.xp);
  }, new Map<string, number>());
  return [...byLabel].map(([label, n]) => ({ label, xp: n })).sort((a, b) => b.xp - a.xp).slice(0, TOP_XP);
}

export function VoicesBlock({ voices, lang }: { voices: VoiceReport[]; lang: Lang }) {
  const t = makeT(DEBRIEF, lang);
  const cards = voices.flatMap((v) => {
    const sources = topSources(v.xp, lang);
    const impacts = v.impacts.flatMap((i) => {
      const text = impactText(i, t, lang);
      return text === null ? [] : [{ kind: i.kind, text }];
    });
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
              <p className={styles.voiceLine}>{t('xpFrom')} {sources.map((s) => `+${s.xp} ${s.label}`).join('; ')}</p>
            )}
            {impacts.map((i) => <p key={i.kind} className={styles.voiceLine}>{i.text}</p>)}
          </li>
        ))}
      </ul>
    </section>
  );
}
