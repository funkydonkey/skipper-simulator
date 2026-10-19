import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useT } from '../../session/SessionContext';

/** Stub: replaced by its owning task. */
export function CheckinScreen() {
  const t = useT(COMMON);
  return <ScreenFrame screen="checkin" title={t('stub')} subtitle="checkin" />;
}
