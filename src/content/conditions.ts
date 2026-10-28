import { BOAT_KEYS, CONTEXT_KEYS, conditionIdentifiers } from '../engine/expr';
import { CHECKPOINTS, VOICES, type ChanceMod, type Content, type Effect } from '../engine/types';
import type { ContentError } from './parse';

function allEffects(c: Content): Effect[] {
  const fromEvents = c.events.flatMap((ev) => ev.options.flatMap((o) => [o.effects, o.success, o.fail]));
  const fromManeuvers = c.maneuvers.flatMap((m) => m.errors.map((e) => e.effect));
  return [...fromEvents, ...fromManeuvers].filter((e): e is Effect => e !== undefined);
}

export function knownIdentifiers(c: Content): Set<string> {
  const effects = allEffects(c);
  const damages = new Set([
    ...Object.keys(c.balance.deposit.damageCostEur),
    ...effects.flatMap((e) => (e.damage ? [e.damage] : [])),
    ...c.boats.flatMap((b) => b.defectPool.flatMap((d) => (d.chargedOnReturn ? [d.chargedOnReturn] : []))),
  ]);
  return new Set<string>([
    ...CONTEXT_KEYS,
    ...BOAT_KEYS,
    ...c.systems.flatMap((s) => ['state', 'broken', 'wear'].map((k) => `system.${s.id}.${k}`)),
    ...VOICES.map((v) => `voice.${v}`),
    ...CHECKPOINTS.flatMap((cp) => [`checkin.${cp}`, `checkin.${cp}.sailed_on`]),
    ...c.briefing.map((t) => `briefing.${t.id}`),
    ...c.boats.flatMap((b) => b.defectPool.flatMap((d) => [`defect.${d.id}`, `defect.${d.id}.found`])),
    ...[...damages].map((d) => `damage.${d}`),
    ...c.crew.flatMap((a) => a.wishes.map((w) => `wish.${w}`)),
    ...effects.flatMap((e) => (e.flag ? [`flag.${e.flag}`] : [])),
    ...c.maneuvers.flatMap((m) => m.steps.map((st) => `step.${st.id}`)),
  ]);
}

export function validateConditions(c: Content): ContentError[] {
  const known = knownIdentifiers(c);
  const errors: ContentError[] = [];
  const check = (src: string, path: string): void => {
    try {
      for (const id of conditionIdentifiers(src)) {
        if (!known.has(id)) errors.push({ file: 'cross', path, message: `Unknown identifier "${id}" in "${src}"` });
      }
    } catch (e) {
      errors.push({ file: 'cross', path, message: (e as Error).message });
    }
  };
  const checkMods = (mods: readonly ChanceMod[] | undefined, path: string): void => (mods ?? []).forEach((m, k) => {
    if (m.if) check(m.if, `${path}[${k}].if`);
    if (m.per && !known.has(m.per)) errors.push({ file: 'cross', path: `${path}[${k}].per`, message: `Unknown identifier "${m.per}"` });
  });
  c.events.forEach((ev, i) => {
    ev.trigger.conditions.forEach((src, j) => check(src, `events[${i}].trigger.conditions[${j}]`));
    const chance = ev.trigger.chance;
    if (typeof chance !== 'number') checkMods(chance.mods, `events[${i}].trigger.chance.mods`);
    ev.voices.forEach((l, j) => { if (l.when) check(l.when, `events[${i}].voices[${j}].when`); });
    (ev.debrief_variants ?? []).forEach((d, j) => check(d.when, `events[${i}].debrief_variants[${j}].when`));
    ev.options.forEach((o, j) => (o.requires ?? []).forEach((src, k) => check(src, `events[${i}].options[${j}].requires[${k}]`)));
  });
  c.systems.forEach((d, i) => {
    d.failures.forEach((f, j) => {
      const path = `systems[${i}].failures[${j}]`;
      if (f.when) check(f.when, `${path}.when`);
      if (typeof f.chance !== 'number') checkMods(f.chance.mods, `${path}.chance.mods`);
    });
    d.repairs.forEach((r, j) => { if (r.requires) check(r.requires, `systems[${i}].repairs[${j}].requires`); });
  });
  c.maneuvers.forEach((m, i) => {
    m.steps.forEach((st, j) => { if (st.when) check(st.when, `maneuvers[${i}].steps[${j}].when`); });
    m.errors.forEach((e, j) => {
      if (e.when) check(e.when, `maneuvers[${i}].errors[${j}].when`);
      if (e.mitigatedBy && !known.has(e.mitigatedBy)) {
        errors.push({ file: 'cross', path: `maneuvers[${i}].errors[${j}].mitigatedBy`, message: `Unknown identifier "${e.mitigatedBy}"` });
      }
    });
    checkMods(m.injuryMods, `maneuvers[${i}].injuryMods`);
  });
  return errors;
}
