import { assertNoPendingEvent, assertPhase } from '../errors';
import { queueEvent } from '../events';
import { appendLog } from '../log';
import { sayDialogue } from '../promises';
import { requireTemplate } from '../state';
import type { Content, GameState } from '../types';
import { rollDayWeather, signalsVisible } from '../weather';

export interface MorningChoice { openBarometer: boolean; dialogueId?: string | null }

export function startDay(state: GameState, content: Content, choice: MorningChoice): GameState {
  assertPhase(state, 'morning');
  assertNoPendingEvent(state);
  const b = content.balance;
  const r = rollDayWeather(state.rng, requireTemplate(content, state.weatherTemplateId), state.day, b);
  const visible = signalsVisible(state.voices.sea_sense, choice.openBarometer, b);
  let s: GameState = { ...state, rng: r.next, clockMin: b.start.hour * 60, weather: { ...r.value, signalsVisible: visible } };
  s = appendLog(s, { kind: 'decision', cause: `barometer:${choice.openBarometer ? 'open' : 'ignored'}`, pillar: 'weather' });
  if (r.value.front) {
    s = appendLog(s, { kind: 'signal', cause: 'signal:front', pillar: 'weather', data: { barometerTrendHpa: r.value.barometerTrendHpa, frontAddKn: r.value.frontAddKn, seen: visible } });
  }
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'morning');
  s = queueEvent(s, content, 'morning');
  return { ...s, phase: 'planning' };
}
