// Chance specs for every engine roll, built from balance. Each reproduces the Stage 2 formula exactly.
import type { Balance, ChanceMod, ChanceSpec, GameEvent, Pillar, Seabed, VoiceCheck } from './types';

export function pillarWeight(day: number, pillar: Pillar, b: Balance): number {
  return b.drama.pillarWeightByDay[String(day)]?.[pillar] ?? 1;
}

/** Caution and order lower the risk of every hands-on mishap multiplicatively. */
const riskMods = (b: Balance): ChanceMod[] => [
  { per: 'voice.caution', mul: -b.voices.cautionRiskPerLevel },
  { per: 'voice.order', mul: -b.voices.orderRiskPerLevel },
];

export function checkSpec(check: VoiceCheck, b: Balance): ChanceSpec {
  const c = b.checks;
  const difficulty: ChanceMod[] = check.difficulty !== 0 ? [{ add: -check.difficulty * c.perLevel, label: 'difficulty' }] : [];
  return {
    base: c.base,
    mods: [
      ...difficulty,
      { per: `voice.${check.voice}`, add: c.perLevel },
      { per: 'fatigue', add: -b.fatigue.checkPenaltyPerPoint, label: 'fatigue' },
    ],
    min: c.min,
    max: c.max,
  };
}

/** `extra` mods (e.g. a maneuver's `injuryMods`) join the same list: adds still apply before muls. */
export function injurySpec(baseChance: number, mitigatedBy: string | undefined, b: Balance, extra: readonly ChanceMod[] = []): ChanceSpec {
  const mitigation: ChanceMod[] = mitigatedBy ? [{ if: mitigatedBy, mul: b.safety.mitigationFactor - 1, label: 'mitigation' }] : [];
  return { base: baseChance, mods: [...riskMods(b), ...mitigation, ...extra] };
}

export function sailBreakSpec(breakChance: number, b: Balance): ChanceSpec {
  return { base: breakChance, mods: riskMods(b) };
}

/** Per attempt. Context: `place.seabed`, `place.berth`, `wind` (kLocal 1), `night`, `briefing.anchor`. */
export function anchorFailSpec(b: Balance): ChanceSpec {
  const t = b.time;
  const [lo, hi] = t.anchorFailChance;
  const seabed: ChanceMod[] = (Object.entries(t.seabedFailFactor) as Array<[Seabed, number]>)
    .filter(([, factor]) => factor > 0)
    .map(([s, factor]) => ({ if: `place.seabed == '${s}'`, add: (hi - lo) * factor, label: 'seabed' }));
  return {
    base: lo,
    mods: [
      ...seabed,
      { if: `wind >= ${t.anchorWindPenaltyKn}`, add: t.anchorWindPenalty, label: 'wind' },
      { if: 'night', add: t.nightAnchorPenalty, label: 'night' },
      { if: 'briefing.anchor', add: -t.anchorBriefedReduction, label: 'briefing' },
      // Stern lines ashore hold the boat: the anchor drags less.
      { if: "place.berth == 'anchor_ashore'", mul: b.berths.ashoreAnchorFailMul, label: 'berth' },
    ],
    max: 0.95,
  };
}

export function marinaRefusalSpec(b: Balance): ChanceSpec {
  return { base: 0, mods: [{ if: 'marina.late', add: b.time.marinaLateRefusalChance, label: 'late' }] };
}

export function eventTriggerSpec(e: GameEvent, day: number, b: Balance): ChanceSpec {
  const input = e.trigger.chance;
  const spec: ChanceSpec = typeof input === 'number' ? { base: input } : input;
  const weight = pillarWeight(day, e.pillar, b);
  const drama: ChanceMod[] = weight !== 1 ? [{ mul: weight - 1, label: 'drama' }] : [];
  return { ...spec, mods: [...(spec.mods ?? []), ...drama], max: Math.min(spec.max ?? 1, 1) };
}
