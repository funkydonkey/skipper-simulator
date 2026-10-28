import { useMemo, useState } from 'react';
import { EngineError, type DayWeather, type Dir8, previewPlan, visibleWeather, type EngineErrorCode, type PlanPreview } from '../../../engine';
import { Button } from '../../components/Button';
import { ChartMap } from '../../components/chart/ChartMap';
import { ResourcePanel } from '../../components/ResourcePanel';
import { ScreenFrame } from '../../components/ScreenFrame';
import { SystemsPanel } from '../../components/SystemsPanel';
import { ENGINE_ERRORS } from '../../i18n/common';
import { useAct, useGame, useSession, useT } from '../../session/SessionContext';
import { DaySettings } from './DaySettings';
import { ForecastPanel } from './ForecastPanel';
import { LegEditor } from './LegEditor';
import { addLeg, departureOptions, initialDraft, reachableFrom, removeLastLeg, toDayPlan, trailOf, updateLeg, type Draft } from './planDraft';
import { PreviewPanel } from './PreviewPanel';
import styles from './Planning.module.css';
import { PLANNING } from './strings';

/** The wind the captain expects to shelter from: the front's direction once its signs are visible. */
const shelterDir = (w: DayWeather): Dir8 => {
  const seen = visibleWeather(w);
  return seen.front ? seen.frontDir : seen.forecastDir;
};

export function PlanningScreen() {
  const { game, content, lang } = useGame();
  const act = useAct();
  const t = useT(PLANNING);
  const te = useT(ENGINE_ERRORS);
  const editDraft = useSession().session.ui.editDraft;
  const departures = departureOptions(game, content);
  const [draft, setDraft] = useState<Draft>(() => initialDraft(game, content, editDraft));
  const trail = trailOf(content, game.locationId, draft.legs);
  const canSail = departures.length > 0;
  const estimate = useMemo<{ preview: PlanPreview | null; error: EngineErrorCode | null }>(() => {
    try { return { preview: previewPlan(game, content, toDayPlan(draft)), error: null }; } catch (e) {
      if (e instanceof EngineError) return { preview: null, error: e.code };
      throw e;
    }
  }, [game, content, draft]);
  const w = game.weather;

  return (
    <ScreenFrame
      screen="planning"
      title={t('title', { n: game.day })}
      subtitle={canSail ? t('subtitle') : t('tooLate')}
      side={<><ForecastPanel /><ResourcePanel /><SystemsPanel systems={game.systems} content={content} lang={lang} /></>}
      actions={draft.legs.length === 0
        ? <Button onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('stay')}</Button>
        : <Button disabled={!canSail || estimate.preview?.arrivalTooLate === true} onClick={() => act({ type: 'draft_plan', plan: toDayPlan(draft) })}>{t('toManeuvers')}</Button>}
    >
      <div className={styles.layout}>
        <ChartMap
          locationId={game.locationId}
          trail={trail}
          reachableIds={canSail ? reachableFrom(content, game, draft) : []}
          onPointClick={(id) => setDraft((d) => addLeg(content, game, d, id))}
          wind={w ? { dir: w.forecastDir } : null}
          forecastDir={w ? shelterDir(w) : null}
        />
        <div className={styles.controls}>
          <div className={styles.columns}>
            <LegEditor legs={draft.legs} trail={trail} onChange={(i, patch) => setDraft((d) => updateLeg(d, i, patch))} onRemoveLast={() => setDraft(removeLastLeg)} />
            <DaySettings draft={draft} departures={departures} onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))} />
          </div>
          {estimate.preview && <PreviewPanel preview={estimate.preview} berth={draft.berth} onBerth={(berth) => setDraft((d) => ({ ...d, berth }))} />}
          {estimate.error && <p role="status" className={styles.warn}>{t('noEstimate', { message: te(estimate.error) })}</p>}
        </div>
      </div>
    </ScreenFrame>
  );
}
