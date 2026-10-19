import type { Maneuver } from '../../../engine';
import { Button } from '../../components/Button';
import { useLang, useT } from '../../session/SessionContext';
import styles from './Maneuvers.module.css';
import { MANEUVERS } from './strings';

export interface OrderPickerProps {
  maneuver: Maneuver;
  pool: readonly string[];
  order: readonly string[];
  onChange: (order: string[]) => void;
  lastOrder?: readonly string[];
}

export function OrderPicker({ maneuver, pool, order, onChange, lastOrder }: OrderPickerProps) {
  const lang = useLang();
  const t = useT(MANEUVERS);
  const text = (id: string): string => maneuver.steps.find((s) => s.id === id)?.text[lang] ?? id;
  const remaining = pool.filter((id) => !order.includes(id));
  return (
    <div className={styles.picker}>
      <div>
        <h3>{t('pool')}</h3>
        <ul className={styles.pool}>
          {remaining.map((id) => <li key={id}><Button variant="secondary" onClick={() => onChange([...order, id])}>{text(id)}</Button></li>)}
        </ul>
        {lastOrder && lastOrder.length === maneuver.steps.length && order.length === 0 && (
          <Button variant="ghost" onClick={() => onChange([...lastOrder])}>{t('last')}</Button>
        )}
      </div>
      <div>
        <h3>{t('order')}</h3>
        <ol className={styles.order}>
          {order.map((id) => (
            <li key={id}>
              <Button variant="ghost" aria-label={t('remove', { step: text(id) })} onClick={() => onChange(order.filter((x) => x !== id))}>{text(id)}</Button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
