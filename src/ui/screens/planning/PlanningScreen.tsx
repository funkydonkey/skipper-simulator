import { useMemo, useState } from 'react';
import { previewPlan, type PlanPreview } from '../../../engine';
import { Button } from '../../components/Button';
import { ChartMap } from '../../components/chart/ChartMap';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { useAct, useGame, useT } from '../../session/SessionContext';
import { DaySettings } from './DaySettings';
import { ForecastPanel } from './ForecastPanel';
import { LegEditor } from './LegEditor';
import { addLeg, departureOptions, initialDraft, reachableFrom, removeLastLeg, toDayPlan, trailOf, updateLeg, type Draft } from './planDraft';
import { PreviewPanel } from './PreviewPanel';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

export function PlanningScreen() {
  const { game, content } = useGame();
  const act = useAct();
  const t = useT(PLANNING);
  const departures = departureOptions(game, content);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(game, content));
  const trail = trailOf(content, game.locationId, draft.legs);
  const canSail = departures.length > 0;
  const preview = useMemo<PlanPreview | null>(() => {
    try { return previewPlan(game, content, toDayPlan(draft)); } catch { return null; }
  }, [game, content, draft]);
  const w = game.weather;

  return (
    <ScreenFrame
      screen="planning"
      title={t('title', { n: game.day })}
      subtitle={canSail ? t('subtitle') : t('tooLate')}
      side={<><ForecastPanel /><ResourcePanel /></>}
      actions={draft.legs.length === 0
        ? <Button onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('stay')}</Button>
        : <Button disabled={!canSail} onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('toManeuvers')}</Button>}
    >
      <ChartMap
        locationId={game.locationId}
        trail={trail}
        reachableIds={canSail ? reachableFrom(content, game, draft) : []}
        onPointClick={(id) => setDraft((d) => addLeg(content, game, d, id))}
        wind={w ? { dir: w.forecastDir, kn: w.forecastKn, gustKn: w.forecastGustKn } : null}
      />
      <div className={styles.columns}>
        <LegEditor legs={draft.legs} trail={trail} onChange={(i, patch) => setDraft((d) => updateLeg(d, i, patch))} onRemoveLast={() => setDraft(removeLastLeg)} />
        <DaySettings draft={draft} departures={departures} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
      </div>
      {preview && <PreviewPanel preview={preview} />}
    </ScreenFrame>
  );
}
