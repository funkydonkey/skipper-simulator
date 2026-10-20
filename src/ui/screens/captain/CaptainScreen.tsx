import { useState } from 'react';
import { TRAINABLE_VOICES, voicePerks, type PerkId, type TrainableVoice, type VoicePerk } from '../../../engine';
import { Button } from '../../components/Button';
import { ScreenFrame } from '../../components/ScreenFrame';
import { VoiceIcon } from '../../components/voices/icons';
import { COMMON } from '../../i18n/common';
import { VOICE_HINTS, VOICE_NAMES } from '../../i18n/glossary';
import { fmt } from '../../i18n/t';
import { useAct, useGame, useT } from '../../session/SessionContext';
import styles from './Captain.module.css';
import { CAPTAIN, PERK_UI, PERKS } from './strings';

type Alloc = Record<TrainableVoice, number>;
/** Signed percent with a true minus sign: −0.16 gives «−16%». */
const percent = (v: number): string => `${v < 0 ? '−' : '+'}${Math.round(Math.abs(v) * 100)}%`;
const zero = (): Alloc => Object.fromEntries(TRAINABLE_VOICES.map((v) => [v, 0])) as Alloc;

export function CaptainScreen() {
  const { content, lang } = useGame();
  const act = useAct();
  const t = useT(CAPTAIN);
  const tc = useT(COMMON);
  const tp = useT(PERK_UI);
  const { points, maxLevel, prideLevel, crewVoiceLevel } = content.balance.voices;
  const [alloc, setAlloc] = useState<Alloc>(zero);
  const remaining = points - TRAINABLE_VOICES.reduce((sum, v) => sum + alloc[v], 0);
  const perkText = (p: VoicePerk): string => fmt(PERKS[p.id][lang], { value: p.value === undefined ? '' : percent(p.value) });
  const nextPerks = (v: TrainableVoice): VoicePerk[] => {
    if (alloc[v] >= maxLevel) return [];
    const have = new Set<PerkId>(voicePerks(v, alloc[v], content.balance).map((p) => p.id));
    return voicePerks(v, alloc[v] + 1, content.balance).filter((p) => !have.has(p.id));
  };
  const change = (v: TrainableVoice, d: number): void => setAlloc((a) => ({ ...a, [v]: a[v] + d }));

  return (
    <ScreenFrame
      screen="captain"
      title={t('title')}
      subtitle={t('subtitle')}
      actions={(
        <>
          <Button variant="ghost" onClick={() => setAlloc(zero())}>{t('reset')}</Button>
          <Button disabled={remaining !== 0} onClick={() => act({ type: 'assign_voices', alloc })}>{tc('next')}</Button>
        </>
      )}
    >
      <p className={styles.remaining}>{t('remaining', { n: remaining })}</p>
      <ul className={styles.voices}>
        {TRAINABLE_VOICES.map((v) => {
          const next = nextPerks(v);
          return (
          <li key={v} className={styles.voice}>
            <div className={styles.head}>
              <strong className={styles.name}><VoiceIcon voice={v} /> {VOICE_NAMES[v][lang]}</strong>
              <span className={styles.stepper}>
                <Button variant="secondary" aria-label={t('lower', { voice: VOICE_NAMES[v][lang] })} disabled={alloc[v] === 0} onClick={() => change(v, -1)}>−</Button>
                <span className={`${styles.level} mono`} aria-live="polite">{alloc[v]}</span>
                <Button variant="secondary" aria-label={t('raise', { voice: VOICE_NAMES[v][lang] })} disabled={remaining === 0 || alloc[v] >= maxLevel} onClick={() => change(v, 1)}>+</Button>
              </span>
            </div>
            <p className={styles.hint}>{VOICE_HINTS[v][lang]}</p>
            <ul className={styles.perks} aria-label={t('perks')}>
              {voicePerks(v, alloc[v], content.balance).map((p) => <li key={p.id}>{perkText(p)}</li>)}
            </ul>
            {next.length > 0 && <p className={styles.next}>{tp('nextLevel', { n: alloc[v] + 1, perk: next.map(perkText).join(', ') })}</p>}
          </li>
          );
        })}
      </ul>
      <h2 className={styles.fixedTitle}>{t('fixedTitle')}</h2>
      <ul className={styles.voices}>
        {([['pride', prideLevel], ['crew_voice', crewVoiceLevel]] as const).map(([v, level]) => (
          <li key={v} className={styles.voice} data-fixed="true">
            <div className={styles.head}>
              <strong className={styles.name}><VoiceIcon voice={v} /> {VOICE_NAMES[v][lang]}</strong>
              <span className="mono">{level}</span>
              <em className={styles.fixed}>{t('fixed')}</em>
            </div>
            <p className={styles.hint}>{VOICE_HINTS[v][lang]}</p>
          </li>
        ))}
      </ul>
    </ScreenFrame>
  );
}
