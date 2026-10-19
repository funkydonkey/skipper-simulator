import type { Grade } from '../../../engine';
import { useT } from '../../session/SessionContext';
import styles from './Debrief.module.css';
import { DEBRIEF } from './strings';

const MARK: Readonly<Record<Grade, string>> = { good: '✓', ok: '~', bad: '✗' };
const KEY = { good: 'gradeGood', ok: 'gradeOk', bad: 'gradeBad' } as const;

export function GradeMark({ grade }: { grade: Grade }) {
  const t = useT(DEBRIEF);
  return <span className={styles.mark} data-grade={grade} role="img" aria-label={t(KEY[grade])}>{MARK[grade]}</span>;
}
