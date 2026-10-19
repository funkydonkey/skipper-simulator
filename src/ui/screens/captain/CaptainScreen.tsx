import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useT } from '../../session/SessionContext';

/** Stub: replaced by its owning task. */
export function CaptainScreen() {
  const t = useT(COMMON);
  return <ScreenFrame screen="captain" title={t('stub')} subtitle="captain" />;
}
