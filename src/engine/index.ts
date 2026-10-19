// Public engine API for the UI. Import from here, not from internal modules.
export * from './types';
export { EngineError, type EngineErrorCode } from './errors';
export { newGame, assignVoices, boatOffers, chooseBoat, performCheckin, performBriefing, type NewGameOptions } from './setup';
export { startDay, type MorningChoice } from './day/morning';
export { planDay, validatePlan } from './day/passage';
export { endDay, finishWeek, tavernaOpen, type EveningChoice } from './day/evening';
export { presentEvent, resolvePendingEvent, optionAvailable, type EventView } from './events';
export { buildDebrief, type Debrief, type DebriefLink, type WeekScales } from './debrief';
export { buildConditionContext } from './expr';
export { formatClock } from './time';
export { resourceReadout, validateAllocation, checkChance } from './voices';
export { realWind, exposure, signalsVisible } from './weather';
export { maneuverForKind, correctOrder } from './maneuver';
export { requirePoint, requireRoute, requireEvent, otherEnd } from './state';
export { causeMatches } from './log';
export { previewPlan, type PlanPreview, type LegPreview } from './preview';
