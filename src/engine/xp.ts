import { appendLog } from './log';
import { TRAINABLE_VOICES, type Balance, type GameState, type TrainableVoice } from './types';

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

/** At most one level per voice per call; surplus XP carries over. A voice at max level drops its XP. */
export function applyLevelUps(state: GameState, b: Balance): GameState {
  let s = state;
  for (const voice of TRAINABLE_VOICES) {
    const level = s.voices[voice];
    if (level >= b.voices.maxLevel) {
      if (s.voiceXp[voice] !== 0) s = { ...s, voiceXp: { ...s.voiceXp, [voice]: 0 } };
      continue;
    }
    const threshold = b.voices.xpToLevel[level];
    if (threshold === undefined || s.voiceXp[voice] < threshold) continue;
    s = {
      ...s,
      voices: { ...s.voices, [voice]: level + 1 },
      voiceXp: { ...s.voiceXp, [voice]: s.voiceXp[voice] - threshold },
    };
    s = appendLog(s, { kind: 'info', cause: `levelup:${voice}:${level + 1}`, data: { from: level, to: level + 1 } });
  }
  return s;
}
