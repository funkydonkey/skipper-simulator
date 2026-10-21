import type { Content, Lang } from '../../engine';
import { systemName } from '../i18n/glossary';
import { makeT } from '../i18n/t';
import styles from './SystemsPanel.module.css';
import { SYSTEMS } from './strings';

export interface SystemsPanelProps {
  systems: Readonly<Record<string, { state: 'new' | 'ok' | 'worn'; broken?: boolean }>>;
  content: Content;
  lang: Lang;
}

/** One row per system: name and a state chip. Broken rows come first, in the critical colour. */
export function SystemsPanel({ systems, content, lang }: SystemsPanelProps) {
  const t = makeT(SYSTEMS, lang);
  const rows = Object.entries(systems)
    .map(([id, s]) => ({ id, state: s.broken ? ('broken' as const) : s.state, broken: Boolean(s.broken) }))
    .sort((a, b) => Number(b.broken) - Number(a.broken));
  return (
    <ul className={styles.list} aria-label={t('label')}>
      {rows.map((r) => (
        <li key={r.id} className={styles.row} data-broken={r.broken} data-state={r.state}>
          <span>{systemName(content, r.id, lang)}</span>
          <span className={styles.chip}>{t(r.state)}</span>
        </li>
      ))}
    </ul>
  );
}
