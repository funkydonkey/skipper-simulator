import { BOAT_KEYS, CONTEXT_KEYS, conditionIdentifiers } from '../engine/expr';
import { CHECKPOINTS, VOICES, type Content, type Effect } from '../engine/types';
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
    ...c.boats.flatMap((b) => b.hiddenDefects.flatMap((d) => (d.chargedOnReturn ? [d.chargedOnReturn] : []))),
  ]);
  return new Set<string>([
    ...CONTEXT_KEYS,
    ...BOAT_KEYS,
    ...VOICES.map((v) => `voice.${v}`),
    ...CHECKPOINTS.map((cp) => `checkin.${cp}`),
    ...c.briefing.map((t) => `briefing.${t.id}`),
    ...c.boats.flatMap((b) => b.hiddenDefects.flatMap((d) => [`defect.${d.id}`, `defect.${d.id}.found`])),
    ...[...damages].map((d) => `damage.${d}`),
    ...c.crew.flatMap((a) => a.wishes.map((w) => `wish.${w}`)),
    ...effects.flatMap((e) => (e.flag ? [`flag.${e.flag}`] : [])),
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
  c.events.forEach((ev, i) => {
    ev.trigger.conditions.forEach((src, j) => check(src, `events[${i}].trigger.conditions[${j}]`));
    const chance = ev.trigger.chance;
    if (typeof chance !== 'number') {
      (chance.mods ?? []).forEach((m, j) => {
        const path = `events[${i}].trigger.chance.mods[${j}]`;
        if (m.if) check(m.if, `${path}.if`);
        if (m.per && !known.has(m.per)) errors.push({ file: 'cross', path: `${path}.per`, message: `Unknown identifier "${m.per}"` });
      });
    }
    ev.voices.forEach((l, j) => { if (l.when) check(l.when, `events[${i}].voices[${j}].when`); });
    ev.options.forEach((o, j) => (o.requires ?? []).forEach((src, k) => check(src, `events[${i}].options[${j}].requires[${k}]`)));
  });
  c.maneuvers.forEach((m, i) => m.errors.forEach((e, j) => {
    if (e.mitigatedBy && !known.has(e.mitigatedBy)) {
      errors.push({ file: 'cross', path: `maneuvers[${i}].errors[${j}].mitigatedBy`, message: `Unknown identifier "${e.mitigatedBy}"` });
    }
  }));
  return errors;
}
