import { pointBerthProblem } from '../engine/berths';
import { CREW_PLACEHOLDER } from '../engine/crew';
import { eventTexts } from '../engine/events';
import { MANEUVER_KINDS, type BerthType, type Content, type Effect, type ManeuverKind } from '../engine/types';
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
  c.map.forEach((p, i) => {
    const problem = pointBerthProblem(p);
    if (problem) add(`map[${i}].berths`, problem);
  });
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

/** The kind a berth's maneuver belongs to. */
const BERTH_KIND: Record<BerthType, ManeuverKind> = { stern_to: 'mooring', side_to: 'mooring', anchor: 'anchoring', anchor_ashore: 'anchoring' };

function checkManeuvers(c: Content, add: Add): void {
  for (const kind of MANEUVER_KINDS) {
    const defaults = c.maneuvers.filter((m) => m.kind === kind && m.berth === undefined).length;
    if (defaults !== 1) add('maneuvers', `kind "${kind}" needs exactly one default maneuver (without berth), found ${defaults}`);
  }
  const seen = new Set<string>();
  c.maneuvers.forEach((m, i) => {
    if (m.berth !== undefined) {
      if (BERTH_KIND[m.berth] !== m.kind) add(`maneuvers[${i}].berth`, `berth "${m.berth}" does not fit kind "${m.kind}"`);
      const key = `${m.kind}:${m.berth}`;
      if (seen.has(key)) add(`maneuvers[${i}].berth`, `second ${m.kind} maneuver for berth "${m.berth}"`);
      seen.add(key);
    }
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

/** Crew names are placeholders, never literals: names go through `{crew.any}` / `{crew.role:<role>}` (nominative only). */
function checkCrewNames(c: Content, add: Add): void {
  const roles = new Set(c.crew.map((a) => a.role));
  const names = c.crew.flatMap((a) => a.names.flatMap((n) => [n.ru, n.en]));
  const literal = names.map((n) => ({ n, re: new RegExp(`(?<![\\p{L}\\p{N}_])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_])`, 'u') }));
  const scan = (path: string, text: string): void => {
    for (const { n, re } of literal) if (re.test(text)) add(path, `literal crew name "${n}": use {crew.any} or {crew.role:<role>}`);
    for (const m of text.matchAll(/\{crew[^}]*\}/g)) {
      const ok = new RegExp(`^${CREW_PLACEHOLDER.source}$`).exec(m[0]);
      if (!ok) add(path, `unknown placeholder "${m[0]}"`);
      else if (ok[2] !== undefined && !roles.has(ok[2])) add(path, `unknown crew role "${ok[2]}"`);
    }
  };
  const both = (path: string, t: { ru: string; en: string }): void => { scan(`${path}.ru`, t.ru); scan(`${path}.en`, t.en); };
  c.events.forEach((ev, i) => {
    eventTexts(ev).forEach((t, k) => both(`events[${i}].text[${k}]`, t));
    ev.voices.forEach((v, j) => both(`events[${i}].voices[${j}].text`, v.text));
    ev.options.forEach((o, j) => both(`events[${i}].options[${j}].text`, o.text));
    if (ev.debrief) both(`events[${i}].debrief`, ev.debrief);
  });
}

/** `break` / `repair` / `wear` must name a system in content.systems; a typo would otherwise silently do nothing. */
function checkSystemRefs(c: Content, add: Add): void {
  const known = new Set(c.systems.map((s) => s.id));
  const check = (path: string, e: Effect | undefined): void => {
    if (!e) return;
    for (const id of [e.break, e.repair, ...Object.keys(e.wear ?? {})]) {
      if (id !== undefined && !known.has(id)) add(path, `unknown system "${id}"`);
    }
  };
  c.events.forEach((ev, i) => ev.options.forEach((o, j) => {
    check(`events[${i}].options[${j}].effects`, o.effects);
    check(`events[${i}].options[${j}].success`, o.success);
    check(`events[${i}].options[${j}].fail`, o.fail);
  }));
  c.maneuvers.forEach((m, i) => m.errors.forEach((e, j) => check(`maneuvers[${i}].errors[${j}].effect`, e.effect)));
  c.systems.forEach((s, i) => {
    s.failures.forEach((f, j) => check(`systems[${i}].failures[${j}].effect`, f.effect));
    check(`systems[${i}].brokenEffect.dailyEffect`, s.brokenEffect.dailyEffect);
    check(`systems[${i}].brokenEffect.anchorEffect`, s.brokenEffect.anchorEffect);
  });
}

/** A failure's `event` must exist and fire in the failure's phase, or the failure would queue nothing (or the wrong scene). */
function checkFailureEvents(c: Content, add: Add): void {
  const events = new Map(c.events.map((e) => [e.id, e]));
  c.systems.forEach((s, i) => s.failures.forEach((f, j) => {
    if (f.event === undefined) return;
    const path = `systems[${i}].failures[${j}].event`;
    const ev = events.get(f.event);
    if (!ev) add(path, `unknown event "${f.event}"`);
    else if (ev.trigger.phase !== f.phase) add(path, `event "${f.event}" fires in phase "${ev.trigger.phase}", the failure in "${f.phase}"`);
  }));
}

/** A typo in a weakness entry must fail validation, not silently match nothing; new boats and systems need no code change. */
function checkWeaknessTargets(c: Content, add: Add): void {
  const boats = new Set(c.boats.map((b) => b.id));
  const systems = new Set(c.systems.map((s) => s.id));
  for (const [boatId, w] of Object.entries(c.balance.simTargets.weakness)) {
    const path = `balance.simTargets.weakness.${boatId}`;
    if (!boats.has(boatId)) add(path, `unknown boat "${boatId}"`);
    w.systems.forEach((id, i) => { if (!systems.has(id)) add(`${path}.systems[${i}]`, `unknown system "${id}"`); });
  }
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
  checkCrewNames(c, add);
  checkSystemRefs(c, add);
  checkFailureEvents(c, add);
  checkWeaknessTargets(c, add);
  return errors;
}
