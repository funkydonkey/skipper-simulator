import { resourceReadout, type Content, type GameState, type Lang, type Resources } from '../../engine';
import { COMMON } from '../i18n/common';
import { fmt } from '../i18n/t';
import { RESOURCE_NAMES, UNITS } from './strings';

export type ResourceKey = keyof Resources;
export type Level = 'ok' | 'low' | 'critical';
export interface ResourceRow { key: ResourceKey; label: string; value: string; share: number | null; level: Level }

/** Display thresholds (share of capacity) for colouring meters. UI only, not game balance. */
export const LOW_SHARE = 0.3;
export const CRITICAL_SHARE = 0.1;
/** Rounding step of the rough readout a captain without a trained Mechanic gets. */
const APPROX_STEP = { waterL: 50, fuelL: 20, serviceBankPct: 10, starterBankPct: 10, gasPct: 10 } as const;
type Gauge = keyof typeof APPROX_STEP;
const PCT = 100;

function levelFor(share: number, inverted = false): Level {
  const s = inverted ? 1 - share : share;
  return s < CRITICAL_SHARE ? 'critical' : s < LOW_SHARE ? 'low' : 'ok';
}

export function resourceRows(game: GameState, content: Content, lang: Lang): ResourceRow[] {
  const boat = content.boats.find((b) => b.id === game.boatId) ?? null;
  const r = game.resources;
  const name = (k: ResourceKey): string => RESOURCE_NAMES[k][lang];
  const gauge = (key: Gauge, capacity: number | null, unit: string): ResourceRow => {
    const share = capacity ? r[key] / capacity : null;
    const value = resourceReadout(r[key], unit, APPROX_STEP[key], game.voices.mechanic, content.balance);
    return { key, label: name(key), value, share, level: share === null ? 'ok' : levelFor(share) };
  };
  return [
    gauge('waterL', boat?.waterTankL ?? null, UNITS.liters[lang]),
    gauge('fuelL', boat?.fuelTankL ?? null, UNITS.liters[lang]),
    gauge('serviceBankPct', PCT, '%'),
    gauge('starterBankPct', PCT, '%'),
    gauge('gasPct', PCT, '%'),
    { key: 'moneyEur', label: name('moneyEur'), value: fmt(COMMON.euro[lang], { n: Math.round(r.moneyEur) }), share: null, level: r.moneyEur < 0 ? 'critical' : 'ok' },
    { key: 'mood', label: name('mood'), value: `${Math.round(r.mood)}/${PCT}`, share: r.mood / PCT, level: levelFor(r.mood / PCT) },
    { key: 'fatigue', label: name('fatigue'), value: `${Math.round(r.fatigue)}/${PCT}`, share: r.fatigue / PCT, level: levelFor(r.fatigue / PCT, true) },
  ];
}
