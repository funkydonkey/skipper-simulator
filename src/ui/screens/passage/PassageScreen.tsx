import { Button } from '../../components/Button';
import { ChartMap } from '../../components/chart/ChartMap';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { COMMON } from '../../i18n/common';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { formatHour } from '../../view/format';
import { pointName } from '../../view/map';
import styles from './Passage.module.css';
import { PASSAGE } from './strings';
import { passageLines, todayTrail } from './timeline';

export function PassageScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(PASSAGE);
  const tc = useT(COMMON);
  const trail = todayTrail(game, content);
  const facts = game.dayFacts;
  return (
    <ScreenFrame
      screen="passage"
      title={t('title')}
      subtitle={t('route', { from: pointName(content, trail[0]!, lang), to: pointName(content, trail[trail.length - 1]!, lang) })}
      side={<ResourcePanel />}
      actions={<Button onClick={() => act({ type: 'passage_seen' })}>{tc('next')}</Button>}
    >
      <ChartMap locationId={game.locationId} trail={trail} animateTrail />
      <ol className={styles.timeline}>
        {passageLines(game, content, lang).map((l, i) => (
          <li key={i} data-tone={l.tone}><span className="mono">{l.clock}</span> {l.text}</li>
        ))}
      </ol>
      {facts?.arrivalHour != null && (
        <p className={styles.arrived}>{t('arrived', { time: formatHour(facts.arrivalHour), mooring: facts.mooring === 'anchor' ? t('anchor') : t('berth') })}</p>
      )}
    </ScreenFrame>
  );
}
