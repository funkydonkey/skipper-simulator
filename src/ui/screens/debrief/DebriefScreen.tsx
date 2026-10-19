import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useT } from '../../session/SessionContext';

/** Stub: replaced by its owning task. */
export function DebriefScreen() {
  const t = useT(COMMON);
  return <ScreenFrame screen="debrief" title={t('stub')} subtitle="debrief" />;
}
