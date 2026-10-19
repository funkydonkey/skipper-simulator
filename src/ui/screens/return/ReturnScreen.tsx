import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useT } from '../../session/SessionContext';

/** Stub: replaced by its owning task. */
export function ReturnScreen() {
  const t = useT(COMMON);
  return <ScreenFrame screen="return" title={t('stub')} subtitle="return" />;
}
