import { describe, expect, it } from 'vitest';
import { validateConditions } from '../../src/content/conditions';
import { loadContentDir } from '../../src/content/load-node';
import { crossValidate } from '../../src/content/validate';
import { evaluateChance } from '../../src/engine/chance';
import { runManeuver } from '../../src/engine/day/arrival';
import { buildConditionContext } from '../../src/engine/expr';
import { planDay, validatePlan } from '../../src/engine/day/passage';
import {
  correctOrder, errorsFor, evaluateManeuver, maneuverFor, maneuverRisk, reconcileOrder, situationHint, stepsFor, validateOrder,
} from '../../src/engine/maneuver';
import { anchorFailSpec } from '../../src/engine/odds';
import { priceFor } from '../../src/engine/perks';
import { previewPlan } from '../../src/engine/preview';
import type { Content, DayPlan, LocalizedText, Maneuver, Situation, WindSide } from '../../src/engine/types';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';
import { makeState } from '../fixtures/state';

const loaded = await loadContentDir('content');
if (!loaded.content) throw new Error(JSON.stringify(loaded.errors));
const real = loaded.content;
const b = real.balance;

const t = (s: string): LocalizedText => ({ ru: s, en: s });
const PORT = "wind.side == 'port'";
/** Steps a, b, c (c only with port wind); c_late fires when b comes before c. */
const abc = (over: Partial<Maneuver> = {}): Maneuver => ({
  id: 'abc', kind: 'mooring', title: t('ABC'),
  steps: [{ id: 'a', text: t('A') }, { id: 'b', text: t('B') }, { id: 'c', text: t('C'), when: PORT }],
  errors: [{ id: 'c_late', when: PORT, wrongIf: { first: 'b', then: 'c' }, effect: { mood: -5 }, injuryChance: 0.2, text: t('late') }],
  ...over,
});
const m = abc();
const ctxOf = (side: WindSide) => ({ 'wind.side': side, 'voice.caution': 0, 'voice.order': 0 });
const SIDES: WindSide[] = ['bow', 'stern', 'port', 'starboard', 'none'];
const sideTo = (base: Maneuver): Maneuver => ({ ...base, id: 'mooring_side_to_fx', berth: 'side_to' });

const situation = (side: WindSide, over: Partial<Situation> = {}): Situation => ({
  berth: 'stern_to', windSide: side, windKn: 12, windDir: 'NW', marinero: false, marineroOdds: null,
  seabed: 'sand', tight: false, source: 'fact', ...over,
});

describe('stepsFor / errorsFor / correctOrder', () => {
  it('filters steps and errors by `when`, keeping content order', () => {
    expect(stepsFor(m, ctxOf('port')).map((s) => s.id)).toEqual(['a', 'b', 'c']);
    expect(stepsFor(m, ctxOf('bow')).map((s) => s.id)).toEqual(['a', 'b']);
    expect(errorsFor(m, ctxOf('port')).map((e) => e.id)).toEqual(['c_late']);
    expect(errorsFor(m, ctxOf('bow'))).toEqual([]);
  });
  it('correctOrder follows the context; without one it keeps only unconditional steps', () => {
    expect(correctOrder(m, ctxOf('port'))).toEqual(['a', 'b', 'c']);
    expect(correctOrder(m, ctxOf('bow'))).toEqual(['a', 'b']);
    expect(correctOrder(m)).toEqual(['a', 'b']);
  });
});

describe('validateOrder / reconcileOrder (R4)', () => {
  it('validateOrder only rejects unknown ids and duplicates', () => {
    expect(validateOrder(m, ['a'])).toBeNull();
    expect(validateOrder(m, ['c', 'b', 'a'])).toBeNull();
    expect(validateOrder(m, [])).toBeNull();
    expect(validateOrder(m, ['a', 'x'])).toMatch(/unknown step "x"/);
    expect(validateOrder(m, ['a', 'a'])).toMatch(/duplicate/);
  });
  it('keeps the player order for steps that exist today and appends the missing ones in content order', () => {
    const steps = stepsFor(m, ctxOf('port'));
    expect(reconcileOrder(['b', 'a'], steps)).toEqual(['b', 'a', 'c']);
    expect(reconcileOrder(['c', 'a', 'b'], stepsFor(m, ctxOf('bow')))).toEqual(['a', 'b']);
  });
});

describe('evaluateManeuver with conditional steps', () => {
  it('a forgotten conditional step counts only through the pairwise error', () => {
    const r = evaluateManeuver(1, m, ['b', 'a'], ctxOf('port'), b);
    expect(r.value.steps).toEqual(['b', 'a', 'c']);
    expect(r.value.errors).toEqual(['c_late']);
    expect(r.value.rolls).toHaveLength(1);
  });
  it('Review Focus 1: an order for a port-wind forecast meets a bow-wind fact: no throw, c_late not judged', () => {
    const r = evaluateManeuver(1, m, ['a', 'c', 'b'], ctxOf('bow'), b);
    expect(r.value.steps).toEqual(['a', 'b']);
    expect(r.value.errors).toEqual([]);
    expect(r.next).toBe(1);
  });
  it('Review Focus 2: the reversed full static order never throws, on any situation', () => {
    const reversed = [...correctOrder(m)].reverse();
    for (const side of SIDES) expect(() => evaluateManeuver(1, m, reversed, ctxOf(side), b)).not.toThrow();
    const full = buildConditionContext(makeState({ boatId: real.boats[0]!.id, weatherTemplateId: 'meltemi_week', systems: {} }), real);
    for (const mm of real.maneuvers) {
      const rev = [...correctOrder(mm)].reverse();
      for (const side of SIDES) expect(() => evaluateManeuver(1, mm, rev, { ...full, 'wind.side': side }, b)).not.toThrow();
    }
  });
  it('still rejects an unknown step', () => {
    expect(() => evaluateManeuver(1, m, ['a', 'zzz'], ctxOf('bow'), b)).toThrow(/INVALID|unknown/);
  });
});

describe('situationHint', () => {
  it('names the first conditional step true today from order level 3', () => {
    expect(situationHint(m, ctxOf('port'), 3)!.id).toBe('c');
    expect(situationHint(m, ctxOf('port'), 2)).toBeNull();
    expect(situationHint(m, ctxOf('bow'), 5)).toBeNull();
  });
});

describe('maneuverFor', () => {
  const c: Content = { ...makeContent(), maneuvers: [...makeContent().maneuvers, sideTo(abc())] };
  it('picks the maneuver of the berth, else the kind default', () => {
    expect(maneuverFor(c, 'mooring', 'side_to')!.id).toBe('mooring_side_to_fx');
    expect(maneuverFor(c, 'mooring', 'stern_to')!.id).toBe('mooring_test');
    expect(maneuverFor(c, 'mooring')!.id).toBe('mooring_test');
    expect(maneuverFor(c, 'departure', 'side_to')!.id).toBe('dep_test');
    expect(maneuverFor({ ...c, maneuvers: [] }, 'mooring')).toBeNull();
  });
});

describe('runManeuver order log', () => {
  it('the order:ok entry carries the reconciled steps', () => {
    const s = runManeuver(makeState(), makeContent(), 'departure');
    const e = s.log.find((x) => x.cause === 'order:ok:dep_test')!;
    expect(e.data).toEqual({ steps: ['neutral', 'command_helm', 'release_lines', 'engage_gear'] });
  });
  it('mooring follows state.situation: berth picks the maneuver, wind side the steps', () => {
    const c: Content = { ...makeContent(), maneuvers: [...makeContent().maneuvers, sideTo(abc())] };
    const port = runManeuver(makeState({ situation: situation('port', { berth: 'side_to' }) }), c, 'mooring', { mooring: ['b', 'a'] });
    expect(port.log.find((x) => x.cause === 'order:wrong:mooring_side_to_fx')!.data).toEqual({ steps: ['b', 'a', 'c'] });
    const bow = runManeuver(makeState({ situation: situation('bow', { berth: 'side_to' }) }), c, 'mooring');
    expect(bow.log.find((x) => x.cause === 'order:ok:mooring_side_to_fx')!.data).toEqual({ steps: ['a', 'b'] });
  });
});

describe('maneuverRisk against a situation', () => {
  it('judges only the errors that apply in the given situation', () => {
    const c: Content = { ...makeContent(), maneuvers: [...makeContent().maneuvers.filter((x) => x.kind !== 'mooring'), abc()] };
    expect(maneuverRisk(makeState(), c, 'mooring', situation('bow'))).toBeNull();
    expect(maneuverRisk(makeState(), c, 'mooring', situation('port'))!.value).toBeGreaterThan(0);
  });
});

describe('anchor ashore', () => {
  it('halves the anchor-drag odds through a seabed mod', () => {
    const ctx = { 'place.seabed': 'sand', wind: 10, night: false };
    const plain = evaluateChance(anchorFailSpec(b), { ...ctx, 'place.berth': 'anchor' });
    const ashore = evaluateChance(anchorFailSpec(b), { ...ctx, 'place.berth': 'anchor_ashore' });
    expect(ashore.value).toBeCloseTo(plain.value * (1 + b.berths.ashoreAnchorFailMul), 12);
    expect(ashore.parts.filter((x) => x.source === 'seabed').length).toBeGreaterThan(plain.parts.filter((x) => x.source === 'seabed').length);
  });
});

describe('arrival by berth (bundled world)', () => {
  const quiet: Content = { ...real, events: [] };
  const stateAt = (locationId: string, over = {}) => makeState({
    locationId, weatherTemplateId: 'meltemi_week', boatId: real.boats[0]!.id, systems: {}, ...over,
  });
  const toNisi = (over: Partial<DayPlan> = {}): DayPlan => ({
    departureHour: 9, swimStops: 0, shower: 'normal', autopilot: false, berth: 'side_to',
    legs: [{ routeId: 'r_cala_azzurra_nisi_quay', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }], ...over,
  });
  const sideFee = (s: { voices: { economist: number } }) => priceFor(40 * b.berths.sideToPriceFactor, s.voices.economist, b);

  it('side-to runs the side-to maneuver and pays the fee x1.5; the situation and marinero roll are recorded', () => {
    const start = deepFreeze(stateAt('cala_azzurra'));
    const s = planDay(start, quiet, toNisi());
    expect(s.log.some((e) => e.cause === 'order:ok:mooring_side_to')).toBe(true);
    const fee = s.log.find((e) => e.cause === 'marina:fee')!;
    expect(fee.delta!.moneyEur).toBeCloseTo(-sideFee(start).eur, 6);
    expect(s.situation).toMatchObject({ berth: 'side_to', source: 'fact' });
    const roll = s.log.find((e) => e.cause === 'roll:marinero:nisi_quay')!;
    expect(roll.kind).toBe('roll');
    expect(roll.odds).toEqual(s.situation!.marineroOdds);
    expect(roll.data).toEqual({ hit: s.situation!.marinero });
  });
  it('stern-to at the same quay runs the default mooring and pays the plain fee', () => {
    const start = stateAt('cala_azzurra');
    const s = planDay(start, quiet, toNisi({ berth: undefined }));
    expect(s.situation!.berth).toBe('stern_to');
    expect(s.log.some((e) => e.cause.startsWith('order:') && e.cause.endsWith(':mooring_side_to'))).toBe(false);
    expect(s.log.find((e) => e.cause === 'marina:fee')!.delta!.moneyEur).toBeCloseTo(-priceFor(40, start.voices.economist, b).eur, 6);
  });
  it('anchor_ashore at a quay is INVALID_INPUT', () => {
    expect(() => validatePlan(stateAt('cala_azzurra'), quiet, toNisi({ berth: 'anchor_ashore' }))).toThrow(/INVALID_INPUT|no "anchor_ashore"/);
  });
  it('Review Focus 4: money for stern-to only → marina:no_money, anchors with berth anchor, the day completes', () => {
    const start = stateAt('cala_azzurra');
    const money = priceFor(40, start.voices.economist, b).eur + 1;
    expect(money).toBeLessThan(sideFee(start).eur);
    const s = planDay({ ...start, resources: { ...start.resources, moneyEur: money } }, quiet, toNisi());
    expect(s.phase).toBe('evening');
    expect(s.log.some((e) => e.cause === 'marina:no_money')).toBe(true);
    expect(s.dayFacts!.mooring).toBe('anchor');
    expect(s.situation!.berth).toBe('anchor');
    expect(s.log.some((e) => e.cause.startsWith('roll:marinero:'))).toBe(false);
  });
  it('anchor_ashore at a bay costs half an hour and logs no marinero roll', () => {
    const toLagoon = (berth?: DayPlan['berth']): DayPlan => ({
      departureHour: 9, swimStops: 0, shower: 'normal', autopilot: false, berth,
      legs: [{ routeId: 'r_base_marina_blue_lagoon', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }],
    });
    const s = planDay(stateAt('base_marina'), quiet, toLagoon('anchor_ashore'));
    expect(s.situation!.berth).toBe('anchor_ashore');
    expect(s.log.find((e) => e.cause === 'anchor:ashore')!.data).toEqual({ time_hours: b.berths.ashoreTimeHours });
    expect(s.log.some((e) => e.cause.startsWith('roll:marinero:'))).toBe(false);
    const plain = planDay(stateAt('base_marina'), quiet, toLagoon());
    expect(plain.situation!.berth).toBe('anchor');
    expect(plain.log.some((e) => e.cause === 'anchor:ashore')).toBe(false);
  });
  it('departure runs with no situation even if one lingers', () => {
    const dep: Maneuver = { ...abc({ id: 'dep_abc', kind: 'departure', errors: [] }) };
    const c: Content = { ...quiet, maneuvers: [...quiet.maneuvers.filter((x) => x.kind !== 'departure'), dep] };
    const lingering = situation('port');
    const s = planDay(stateAt('nisi_quay', { situation: lingering }), c, {
      departureHour: 9, swimStops: 0, shower: 'normal', autopilot: false,
      legs: [{ routeId: 'r_cala_azzurra_nisi_quay', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }],
    });
    expect(s.log.find((e) => e.cause === 'order:ok:dep_abc')!.data).toEqual({ steps: ['a', 'b'] });
  });

  it('the preview shows the forecast situation, the destination berths and the side-to price', () => {
    const start = stateAt('cala_azzurra');
    const p = previewPlan(start, quiet, toNisi());
    expect(p.situation).toMatchObject({ berth: 'side_to', source: 'forecast' });
    expect(p.berths).toEqual(['stern_to', 'side_to']);
    expect(p.marinaAffordable).toBe(true);
    const poor = { ...start, resources: { ...start.resources, moneyEur: priceFor(40, start.voices.economist, b).eur + 1 } };
    expect(previewPlan(poor, quiet, toNisi()).marinaAffordable).toBe(false);
    expect(previewPlan(poor, quiet, toNisi({ berth: 'stern_to' })).marinaAffordable).toBe(true);
    const stay = previewPlan(start, quiet, { ...toNisi(), legs: [], berth: undefined });
    expect(stay.situation).toBeNull();
    expect(stay.berths).toEqual(['anchor']);
  });
  it('the preview anchor-fail odds use the planned berth', () => {
    const toLagoon = (berth?: DayPlan['berth']): DayPlan => ({
      departureHour: 9, swimStops: 0, shower: 'normal', autopilot: false, berth,
      legs: [{ routeId: 'r_base_marina_blue_lagoon', mode: 'motor', reefs: 0, genoa: 'full', course: 'direct' }],
    });
    const plain = previewPlan(stateAt('base_marina'), quiet, toLagoon()).anchorFail!.value;
    const ashore = previewPlan(stateAt('base_marina'), quiet, toLagoon('anchor_ashore')).anchorFail!.value;
    expect(ashore).toBeLessThan(plain);
  });
});

describe('content validation', () => {
  it('rejects an unknown key inside a step or error `when`', () => {
    const c = makeContent();
    c.maneuvers.push({ ...abc({ id: 'abc_bad' }), steps: [...abc().steps.slice(0, 2), { id: 'c', text: t('C'), when: "wind.sidee == 'port'" }] });
    c.maneuvers[c.maneuvers.length - 1]!.errors[0]!.when = 'place.berthh';
    const paths = validateConditions(c).map((e) => e.path);
    expect(paths).toContain(`maneuvers[${c.maneuvers.length - 1}].steps[2].when`);
    expect(paths).toContain(`maneuvers[${c.maneuvers.length - 1}].errors[0].when`);
  });
  it('needs exactly one default maneuver per kind and unique berths', () => {
    const base = makeContent();
    const msgs = (maneuvers: Maneuver[]) => crossValidate({ ...base, maneuvers }).map((e) => `${e.path}: ${e.message}`).join('\n');
    expect(msgs(base.maneuvers)).toBe('');
    expect(msgs([...base.maneuvers, sideTo(abc())])).toBe('');
    expect(msgs([...base.maneuvers, abc()])).toMatch(/default/);
    expect(msgs([...base.maneuvers, sideTo(abc()), { ...sideTo(abc()), id: 'twin' }])).toMatch(/side_to/);
    expect(msgs([...base.maneuvers, { ...abc(), id: 'wrong_kind', berth: 'anchor_ashore' }])).toMatch(/anchor_ashore/);
    expect(msgs([...base.maneuvers.filter((x) => x.kind !== 'mooring'), sideTo(abc())])).toMatch(/mooring/);
  });
});
