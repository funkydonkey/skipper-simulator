import type {
  CheckpointId, Content, DayPlan, EngineErrorCode, EveningChoice, GameState, Lang, LogEntry, ManeuverKind, MorningChoice, TrainableVoice,
} from '../../engine';

export type Screen =
  | 'menu' | 'captain' | 'boat' | 'checkin' | 'defects' | 'briefing' | 'morning' | 'planning' | 'maneuvers'
  | 'passage' | 'event' | 'outcome' | 'evening' | 'return' | 'debrief';

export type ManeuverOrders = Partial<Record<ManeuverKind, string[]>>;

/** What the last event choice did: the log entries it appended. */
export interface EventOutcome { eventId: string; optionId: string; entries: LogEntry[] }

/** UI-only steps that the engine does not model. */
export interface UiState {
  draftPlan: DayPlan | null;
  passageDay: number | null;
  outcome: EventOutcome | null;
  lastOrders: ManeuverOrders;
  /** The plan taken back from the maneuvers screen: the planner reopens with it. */
  editDraft: DayPlan | null;
}

/** An engine rejection: `code` picks the localized text, `message` is English debug detail. */
export interface SessionError { code: EngineErrorCode; message: string }

export interface Session {
  content: Content;
  lang: Lang;
  game: GameState | null;
  ui: UiState;
  error: SessionError | null;
}

export type ActionBody =
  | { type: 'new_game'; seed: number }
  | { type: 'load'; game: GameState }
  | { type: 'to_menu' }
  | { type: 'set_lang'; lang: Lang }
  | { type: 'assign_voices'; alloc: Partial<Record<TrainableVoice, number>> }
  | { type: 'choose_boat'; boatId: string }
  | { type: 'checkin'; checkpoints: CheckpointId[] }
  | { type: 'resolve_defects'; fixIds: string[] }
  | { type: 'briefing'; topicIds: string[]; dialogueIds: string[] }
  | { type: 'start_day'; choice: MorningChoice }
  | { type: 'draft_plan'; plan: DayPlan }
  | { type: 'cancel_draft' }
  | { type: 'commit_plan'; orders: ManeuverOrders }
  | { type: 'passage_seen' }
  | { type: 'resolve_event'; optionId: string }
  | { type: 'outcome_seen' }
  | { type: 'end_day'; choice: EveningChoice }
  | { type: 'repair'; systemId: string; repairId: string }
  | { type: 'finish_week' }
  | { type: 'dismiss_error' };

/** `key` = screenKey at the moment the button was rendered; stale keys are ignored. */
export type Action = ActionBody & { key?: string };
