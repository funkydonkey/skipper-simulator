import { applyDefects, pickDefects } from './defects';
import { assertPhase, EngineError } from './errors';
import { appendLog } from './log';
import { sayDialogue } from './promises';
import { advanceClock, requireBoat, requireTemplate } from './state';
import { CHECKPOINTS, TRAINABLE_VOICES, type Boat, type CheckpointId, type Content, type CrewMember, type GameState, type Lang, type TrainableVoice } from './types';
import { initialSystems } from './systems';
import { initialVoices } from './voices';

export interface NewGameOptions { seed: number; lang: Lang; weatherTemplateId?: string; crewSize?: number }

function makeCrew(content: Content, size: number): CrewMember[] {
  const n = content.crew.length;
  return Array.from({ length: size }, (_, i) => {
    const a = content.crew[i % n]!;
    return { id: `crew_${i + 1}`, archetypeId: a.id, name: a.names[Math.floor(i / n) % a.names.length]! };
  });
}

export function newGame(content: Content, opts: NewGameOptions): GameState {
  const b = content.balance;
  const base = content.map.find((p) => p.kind === 'base');
  if (!base) throw new EngineError('CONTENT', 'Map has no base point');
  const template = opts.weatherTemplateId ? requireTemplate(content, opts.weatherTemplateId) : content.weather[0];
  if (!template) throw new EngineError('CONTENT', 'No weather templates');
  const crewSize = opts.crewSize ?? b.start.crewSize;
  if (!Number.isInteger(crewSize) || crewSize < 1) throw new EngineError('INVALID_INPUT', `crewSize must be a positive integer, got ${crewSize}`);
  return {
    version: 3, seed: opts.seed, rng: opts.seed >>> 0, lang: opts.lang, phase: 'captain', day: 0,
    clockMin: b.start.hour * 60, weatherTemplateId: template.id, locationId: base.id, boatId: null,
    voices: initialVoicesZero(),
    voiceXp: { sea_sense: 0, caution: 0, order: 0, mechanic: 0, diplomat: 0, economist: 0 },
    resources: { waterL: 0, fuelL: 0, serviceBankPct: b.start.serviceBankPct, starterBankPct: b.start.starterBankPct, gasPct: b.start.gasPct, moneyEur: b.start.moneyEur, mood: b.start.mood, fatigue: b.start.fatigue },
    flags: {}, damages: [], systems: {}, crew: makeCrew(content, crewSize), expectations: [], moodPerDay: 0, injuries: 0,
    log: [], firedEvents: [], eventQueue: [], weather: null, dayFacts: null, returnedOnTime: null, defects: [], checkin: null, startBalanceEur: 0,
  };
}

function initialVoicesZero(): GameState['voices'] {
  return { sea_sense: 0, caution: 0, order: 0, mechanic: 0, diplomat: 0, economist: 0, pride: 0, crew_voice: 0 };
}

export function assignVoices(state: GameState, content: Content, alloc: Partial<Record<TrainableVoice, number>>): GameState {
  assertPhase(state, 'captain');
  const voices = initialVoices(alloc, content.balance);
  const logged = TRAINABLE_VOICES.reduce((s, v) => appendLog(s, { kind: 'decision', cause: `voices:${v}:${voices[v]}` }), state);
  return { ...logged, voices, phase: 'boat_select' };
}

export function boatOffers(state: GameState, content: Content): Array<{ boat: Boat; affordable: boolean }> {
  return content.boats.map((boat) => ({ boat, affordable: boat.priceEur <= state.resources.moneyEur }));
}

export function chooseBoat(state: GameState, content: Content, boatId: string): GameState {
  assertPhase(state, 'boat_select');
  const boat = content.boats.find((b) => b.id === boatId);
  if (!boat) throw new EngineError('NOT_FOUND', `Boat "${boatId}" not found`);
  if (boat.priceEur > state.resources.moneyEur) throw new EngineError('BUDGET', `Cannot afford ${boat.id}: ${boat.priceEur} > ${state.resources.moneyEur}`);
  const picked = pickDefects(state.rng, boat);
  const s: GameState = {
    ...state,
    rng: picked.next,
    boatId: boat.id,
    phase: 'checkin',
    defects: picked.value,
    systems: applyDefects(initialSystems(boat), boat, picked.value),
    startBalanceEur: state.resources.moneyEur - boat.priceEur,
    resources: { ...state.resources, moneyEur: state.resources.moneyEur - boat.priceEur, waterL: boat.waterTankL, fuelL: boat.fuelTankL },
  };
  return appendLog(s, { kind: 'decision', cause: `boat:choose:${boat.id}`, pillar: 'boat' });
}

function validateCheckpoints(checkpoints: readonly CheckpointId[], content: Content): number {
  const unknown = checkpoints.find((c) => !CHECKPOINTS.includes(c));
  if (unknown) throw new EngineError('INVALID_INPUT', `unknown checkpoint "${unknown}"`);
  if (new Set(checkpoints).size !== checkpoints.length) throw new EngineError('INVALID_INPUT', 'duplicate checkpoints');
  const cost = checkpoints.reduce((sum, c) => sum + content.balance.checkin.costMin[c], 0);
  if (cost > content.balance.checkin.budgetMin) {
    throw new EngineError('BUDGET', `Check-in takes ${cost} min, budget is ${content.balance.checkin.budgetMin} min`);
  }
  return cost;
}

export function performCheckin(state: GameState, content: Content, checkpoints: readonly CheckpointId[]): GameState {
  assertPhase(state, 'checkin');
  const boat = requireBoat(content, state);
  const cost = validateCheckpoints(checkpoints, content);
  const checked = new Set<CheckpointId>(checkpoints);
  let s = CHECKPOINTS.reduce((acc, cp) => appendLog(acc, { kind: 'decision', cause: `checkin:${checked.has(cp) ? 'check' : 'skip'}:${cp}`, pillar: 'boat' }), state);
  const flags: Record<string, boolean> = { ...s.flags };
  for (const cp of checked) flags[`checkin.${cp}`] = true;
  const found: string[] = [];
  for (const d of boat.defectPool.filter((x) => s.defects.includes(x.id))) {
    const seen = checked.has(d.checkpoint);
    if (seen) found.push(d.id);
    flags[seen ? `defect.${d.id}.found` : `defect.${d.id}`] = true;
    s = appendLog(s, { kind: 'info', cause: seen ? `checkin:found:${d.id}` : `defect:hidden:${d.id}`, pillar: 'boat' });
  }
  const fixableFound = found.some((id) => boat.defectPool.find((d) => d.id === id)?.system);
  const checkin = fixableFound ? { found, fixed: [], minutesLeft: content.balance.checkin.budgetMin - cost } : null;
  return { ...advanceClock({ ...s, flags }, cost), checkin, phase: fixableFound ? 'defects' : 'briefing' };
}

function validateTopics(topicIds: readonly string[], content: Content): void {
  const slots = content.balance.briefing.slots;
  if (topicIds.length !== slots || new Set(topicIds).size !== slots) {
    throw new EngineError('INVALID_INPUT', `Choose exactly ${slots} different briefing topics`);
  }
  const unknown = topicIds.find((id) => !content.briefing.some((t) => t.id === id));
  if (unknown) throw new EngineError('INVALID_INPUT', `unknown topic "${unknown}"`);
}

export function performBriefing(state: GameState, content: Content, topicIds: readonly string[], dialogueIds: readonly string[]): GameState {
  assertPhase(state, 'briefing');
  validateTopics(topicIds, content);
  const max = content.balance.briefing.maxDialogues;
  if (dialogueIds.length > max) throw new EngineError('INVALID_INPUT', `Say at most ${max} lines at the briefing`);
  const chosen = new Set(topicIds);
  let s = content.briefing.reduce(
    (acc, t) => appendLog(acc, { kind: 'decision', cause: `briefing:${chosen.has(t.id) ? 'topic' : 'skip'}:${t.id}`, pillar: 'briefing' }),
    state,
  );
  const flags = { ...s.flags };
  for (const id of chosen) flags[`briefing.${id}`] = true;
  s = { ...s, flags };
  s = dialogueIds.reduce((acc, id) => sayDialogue(acc, content, id, 'briefing'), s);
  return { ...s, phase: 'morning', day: 1, clockMin: content.balance.start.hour * 60 };
}
