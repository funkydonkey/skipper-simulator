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
  const prevFront = state.log.some((e) => e.cause === `roll:front:${state.day - 1}` && e.data?.hit === true);
  const r = rollDayWeather(state.rng, requireTemplate(content, state.weatherTemplateId), state.day, b, prevFront);
  const sensed = signalsVisible(state.voices.sea_sense, false, b);
  const visible = signalsVisible(state.voices.sea_sense, choice.openBarometer, b);
  const w = r.value.weather;
  let s: GameState = { ...state, rng: r.next, clockMin: b.start.hour * 60, weather: { ...w, signalsVisible: visible } };
  s = appendLog(s, { kind: 'roll', cause: `roll:front:${state.day}`, pillar: 'weather', odds: r.value.frontOdds, data: { hit: w.front } });
  s = appendLog(s, { kind: 'decision', cause: `barometer:${choice.openBarometer ? 'open' : 'ignored'}`, pillar: 'weather' });
  if (w.front) {
    s = appendLog(s, { kind: 'signal', cause: 'signal:front', pillar: 'weather', data: { barometerTrendHpa: w.barometerTrendHpa, frontAddKn: w.frontAddKn, seen: visible } });
  }
  if (w.front && sensed) s = appendLog(s, { kind: 'info', cause: 'voice:sea_sense:front_seen', pillar: 'weather' });
  if (choice.dialogueId) s = sayDialogue(s, content, choice.dialogueId, 'morning');
  s = queueEvent(s, content, 'morning');
  return { ...s, phase: 'planning' };
}
