import { useState } from 'react';
import type { Maneuver } from '../../../engine';
import { Button } from '../../components/Button';
import { useLang, useT } from '../../session/SessionContext';
import styles from './Maneuvers.module.css';
import { MANEUVERS } from './strings';

export interface OrderPickerProps {
  maneuver: Maneuver;
  /** Today's steps (shuffled): only these can be ordered. */
  pool: readonly string[];
  order: readonly string[];
  onChange: (order: string[]) => void;
  /** The last order given for this kind; it may hold steps today does not have, or miss some it adds. */
  lastOrder?: readonly string[];
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((id) => b.includes(id));

export function OrderPicker({ maneuver, pool, order, onChange, lastOrder = [] }: OrderPickerProps) {
  const lang = useLang();
  const t = useT(MANEUVERS);
  const [filled, setFilled] = useState<{ n: number; m: number } | null>(null);
  const text = (id: string): string => maneuver.steps.find((s) => s.id === id)?.text[lang] ?? id;
  const remaining = pool.filter((id) => !order.includes(id));
  const repeat = lastOrder.filter((id, i) => pool.includes(id) && lastOrder.indexOf(id) === i);
  const change = (next: string[]) => {
    setFilled(null);
    onChange(next);
  };
  const fillLast = () => {
    setFilled(sameSet(lastOrder, pool) ? null : { n: repeat.length, m: pool.length });
    onChange(repeat);
  };
  return (
    <div className={styles.picker}>
      <div>
        <h3>{t('pool')}</h3>
        <ul className={styles.pool}>
          {remaining.map((id) => <li key={id}><Button variant="secondary" data-step={id} onClick={() => change([...order, id])}>{text(id)}</Button></li>)}
        </ul>
        {repeat.length > 0 && order.length === 0 && <Button variant="ghost" onClick={fillLast}>{t('last')}</Button>}
        {filled && <p className={styles.note} role="status">{t('filled', { n: filled.n, m: filled.m })}</p>}
      </div>
      <div>
        <h3>{t('order')}</h3>
        <ol className={styles.order}>
          {order.map((id) => (
            <li key={id}>
              <Button variant="ghost" data-step={id} aria-label={t('remove', { step: text(id) })} onClick={() => change(order.filter((x) => x !== id))}>{text(id)}</Button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
