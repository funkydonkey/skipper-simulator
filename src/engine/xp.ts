import { appendLog } from './log';
import { TRAINABLE_VOICES, type Balance, type GameState, type TrainableVoice, type VoiceId } from './types';

export type XpGrant = Partial<Record<TrainableVoice, number>>;

/** Adds XP per voice. Exempt voices and voices already at max level learn nothing. Never changes `voices`: levels move in `applyLevelUps`. */
export function grantXp(state: GameState, xp: XpGrant, cause: string, b: Balance): GameState {
  let s = state;
  for (const voice of TRAINABLE_VOICES) {
    const amount = xp[voice] ?? 0;
    if (amount <= 0 || b.voices.xpExempt.includes(voice) || s.voices[voice] >= b.voices.maxLevel) continue;
    s = appendLog({ ...s, voiceXp: { ...s.voiceXp, [voice]: s.voiceXp[voice] + amount } }, { kind: 'info', cause: `xp:${voice}:${cause}`, data: { xp: amount } });
  }
  return s;
}

/** XP for the checked voice after a voice check; `override` is an option's own `xp`. Non-trainable voices learn nothing. */
export function grantCheckXp(state: GameState, voice: VoiceId, success: boolean, cause: string, b: Balance, override?: number): GameState {
  if (!(TRAINABLE_VOICES as readonly string[]).includes(voice)) return state;
  const xp = override ?? (success ? b.voices.checkXp.success : b.voices.checkXp.fail);
  return grantXp(state, { [voice]: xp }, cause, b);
}

/** The single rule for a level-up: below max level, with XP at or above the next threshold. */
function levelUpThreshold(state: GameState, voice: TrainableVoice, b: Balance): number | null {
  const level = state.voices[voice];
  if (level >= b.voices.maxLevel) return null;
  const threshold = b.voices.xpToLevel[level];
  return threshold !== undefined && state.voiceXp[voice] >= threshold ? threshold : null;
}

/** Level-ups `applyLevelUps` would make right now, without changing the state. */
export function pendingLevelUps(state: GameState, b: Balance): Array<{ voice: TrainableVoice; from: number; to: number }> {
  return TRAINABLE_VOICES.flatMap((voice) => (levelUpThreshold(state, voice, b) === null ? [] : [{ voice, from: state.voices[voice], to: state.voices[voice] + 1 }]));
}

/** At most one level per voice per call; surplus XP carries over. A voice at max level drops its XP. */
export function applyLevelUps(state: GameState, b: Balance): GameState {
  let s = state;
  for (const voice of TRAINABLE_VOICES) {
    const level = s.voices[voice];
    if (level >= b.voices.maxLevel) {
      if (s.voiceXp[voice] !== 0) s = { ...s, voiceXp: { ...s.voiceXp, [voice]: 0 } };
      continue;
    }
    const threshold = levelUpThreshold(s, voice, b);
    if (threshold === null) continue;
    s = {
      ...s,
      voices: { ...s.voices, [voice]: level + 1 },
      voiceXp: { ...s.voiceXp, [voice]: s.voiceXp[voice] - threshold },
    };
    s = appendLog(s, { kind: 'info', cause: `levelup:${voice}:${level + 1}`, data: { from: level, to: level + 1 } });
  }
  return s;
}
