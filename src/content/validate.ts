import { MANEUVER_KINDS, type Content } from '../engine/types';
import type { ContentError } from './parse';

type Add = (path: string, message: string) => void;

function uniqueIds(name: string, items: ReadonlyArray<{ id: string }>, add: Add): void {
  const seen = new Set<string>();
  items.forEach((item, i) => {
    if (seen.has(item.id)) add(`${name}[${i}].id`, `duplicate id "${item.id}"`);
    seen.add(item.id);
  });
}

function checkMap(c: Content, add: Add): void {
  const bases = c.map.filter((p) => p.kind === 'base');
  if (bases.length !== 1) add('map', `exactly one base point required, found ${bases.length}`);
  const ids = new Set(c.map.map((p) => p.id));
  c.routes.forEach((r, i) => {
    if (!ids.has(r.from)) add(`routes[${i}].from`, `unknown point "${r.from}"`);
    if (!ids.has(r.to)) add(`routes[${i}].to`, `unknown point "${r.to}"`);
    if (r.from === r.to) add(`routes[${i}]`, 'route must connect two different points');
  });
  const base = bases[0];
  if (!base) return;
  const reached = new Set([base.id]);
  const queue = [base.id];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const r of c.routes) {
      const next = r.from === cur ? r.to : r.to === cur ? r.from : null;
      if (next && !reached.has(next)) { reached.add(next); queue.push(next); }
    }
  }
  c.map.forEach((p, i) => { if (!reached.has(p.id)) add(`map[${i}]`, `point "${p.id}" is unreachable from base`); });
}

function checkWeatherAndBriefing(c: Content, add: Add): void {
  c.weather.forEach((t, i) => {
    for (let day = 1; day <= c.balance.schedule.days; day++) {
      if (!t.days.some((d) => d.day === day)) add(`weather[${i}].days`, `template "${t.id}" has no day ${day}`);
    }
  });
  if (c.briefing.length < c.balance.briefing.slots) add('briefing', `need at least ${c.balance.briefing.slots} topics`);
}

function checkManeuvers(c: Content, add: Add): void {
  for (const kind of MANEUVER_KINDS) {
    if (!c.maneuvers.some((m) => m.kind === kind)) add('maneuvers', `no maneuver of kind "${kind}"`);
  }
  c.maneuvers.forEach((m, i) => {
    uniqueIds(`maneuvers[${i}].steps`, m.steps, add);
    const steps = new Set(m.steps.map((s) => s.id));
    m.errors.forEach((e, j) => {
      for (const ref of [e.wrongIf.first, e.wrongIf.then]) {
        if (!steps.has(ref)) add(`maneuvers[${i}].errors[${j}].wrongIf`, `unknown step "${ref}"`);
      }
    });
  });
}

function checkEvents(c: Content, add: Add): void {
  const dialogues = new Map(c.dialogues.map((d) => [d.id, d]));
  c.events.forEach((ev, i) => {
    uniqueIds(`events[${i}].options`, ev.options, add);
    ev.voices.forEach((v, j) => {
      if (v.min_level > c.balance.voices.maxLevel) add(`events[${i}].voices[${j}].min_level`, `exceeds max level ${c.balance.voices.maxLevel}`);
    });
    ev.options.forEach((o, j) => {
      const context = ev.trigger.phase === 'morning' ? 'morning' : 'evening';
      for (const eff of [o.effects, o.success, o.fail]) {
        if (!eff?.promise) continue;
        const d = dialogues.get(eff.promise);
        if (!d) add(`events[${i}].options[${j}]`, `unknown dialogue "${eff.promise}"`);
        else if (!d.contexts.includes(context)) add(`events[${i}].options[${j}]`, `dialogue "${d.id}" has no "${context}" context`);
      }
    });
  });
}

export function crossValidate(c: Content): ContentError[] {
  const errors: ContentError[] = [];
  const add: Add = (path, message) => errors.push({ file: 'cross', path, message });
  const lists = { boats: c.boats, map: c.map, routes: c.routes, weather: c.weather, crew: c.crew, briefing: c.briefing, events: c.events, dialogues: c.dialogues, debrief: c.debrief, maneuvers: c.maneuvers };
  for (const [name, items] of Object.entries(lists)) uniqueIds(name, items, add);
  checkMap(c, add);
  checkWeatherAndBriefing(c, add);
  checkManeuvers(c, add);
  checkEvents(c, add);
  return errors;
}
