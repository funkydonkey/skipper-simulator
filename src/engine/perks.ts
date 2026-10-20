import { requireTemplate, round1 } from './state';
import type { Balance, Content, GameState, TrainableVoice } from './types';

/** Economist discount on money the skipper spends (marina, fuel, gas, taverna). */
export function priceFor(eur: number, economistLevel: number, b: Balance): { eur: number; savedEur: number } {
  const price = round1(eur * (1 - economistLevel * b.voices.economistDiscountPerLevel));
  return { eur: price, savedEur: round1(eur - price) };
}

/** What Sea Sense lets the skipper know about today's front. */
export function forecastInsight(state: GameState, content: Content): { frontChance: number | null; frontFromHour: number | null } {
  const b = content.balance;
  const level = state.voices.sea_sense;
  const today = requireTemplate(content, state.weatherTemplateId).days.find((d) => d.day === state.day);
  return {
    frontChance: today && level >= b.voices.seaSenseChanceLevel ? today.frontChance : null,
    frontFromHour: state.weather?.front && level >= b.voices.seaSenseTimingLevel ? b.weather.afternoonFromHour : null,
  };
}

export type PerkId =
  | 'risk_injury' | 'maneuver_time' | 'check_bonus' | 'exact_gauges' | 'local_wind'
  | 'front_signals' | 'front_chance' | 'front_timing' | 'promise_softening' | 'discount';
export interface VoicePerk { id: PerkId; value?: number }

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/** The mechanical perks a trainable voice grants at `level`; a perk is listed only while it has an effect. */
export function voicePerks(voice: TrainableVoice, level: number, b: Balance): VoicePerk[] {
  const v = b.voices;
  const perk = (id: PerkId, value?: number): VoicePerk[] => (value === undefined ? [{ id }] : [{ id, value: round3(value) }]);
  const when = (ok: boolean, perks: VoicePerk[]): VoicePerk[] => (ok ? perks : []);
  const check = when(level > 0 && voice !== 'economist', perk('check_bonus', level * b.checks.perLevel));
  switch (voice) {
    case 'sea_sense':
      return [
        ...when(level >= v.seaSenseSignalLevel, [...perk('local_wind'), ...perk('front_signals')]),
        ...when(level >= v.seaSenseChanceLevel, perk('front_chance')),
        ...when(level >= v.seaSenseTimingLevel, perk('front_timing')),
        ...check,
      ];
    case 'caution':
      return [...when(level > 0, [...perk('risk_injury', -level * v.cautionRiskPerLevel), ...perk('maneuver_time', level * v.cautionTimePerLevel)]), ...check];
    case 'order':
      return [...when(level > 0, perk('risk_injury', -level * v.orderRiskPerLevel)), ...check];
    case 'mechanic':
      return [...when(level >= v.mechanicExactLevel, perk('exact_gauges')), ...check];
    case 'diplomat':
      return [...when(level > 0, perk('promise_softening', -level * b.promises.diplomatSofteningPerLevel)), ...check];
    case 'economist':
      return when(level > 0, perk('discount', -level * v.economistDiscountPerLevel));
  }
}
