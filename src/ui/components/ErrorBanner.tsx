import { COMMON, ENGINE_ERRORS } from '../i18n/common';
import { useSession, useT } from '../session/SessionContext';
import { Button } from './Button';
import styles from './ErrorBanner.module.css';

export function ErrorBanner() {
  const { session, dispatch } = useSession();
  const t = useT(COMMON);
  const te = useT(ENGINE_ERRORS);
  const error = session.error;
  if (!error) return null;
  return (
    <div role="alert" className={styles.banner}>
      <span title={error.message}>{t('errorPrefix', { message: te(error.code) })}</span>
      <Button variant="ghost" className={styles.dismiss} onClick={() => dispatch({ type: 'dismiss_error' })}>{t('dismiss')}</Button>
    </div>
  );
}
