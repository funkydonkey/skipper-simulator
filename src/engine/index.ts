// Public engine API for the UI (Stage 2). Import from here, not from internal modules.
export * from './types';
export { EngineError, type EngineErrorCode } from './errors';
export { newGame, assignVoices, boatOffers, chooseBoat, performCheckin, performBriefing, type NewGameOptions } from './setup';
export { startDay, type MorningChoice } from './day/morning';
export { planDay, validatePlan } from './day/passage';
export { endDay, finishWeek, type EveningChoice } from './day/evening';
export { presentEvent, resolvePendingEvent, type EventView } from './events';
export { buildDebrief, type Debrief, type DebriefLink, type WeekScales } from './debrief';
export { buildConditionContext } from './expr';
export { formatClock } from './time';
export { resourceReadout } from './voices';
export { realWind } from './weather';
