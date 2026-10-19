import { COMMON } from '../i18n/common';
import { useSession, useT } from '../session/SessionContext';
import { Button } from './Button';
import styles from './ErrorBanner.module.css';

export function ErrorBanner() {
  const { session, dispatch } = useSession();
  const t = useT(COMMON);
  if (!session.error) return null;
  return (
    <div role="alert" className={styles.banner}>
      <span>{t('errorPrefix', { message: session.error })}</span>
      <Button variant="ghost" onClick={() => dispatch({ type: 'dismiss_error' })}>{t('dismiss')}</Button>
    </div>
  );
}
