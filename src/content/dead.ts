import { BOAT_KEYS, conditionIdentifiers } from '../engine/expr';
import { CHECKPOINTS, type Content, type Effect } from '../engine/types';
import type { ContentError } from './parse';

export interface DeadAllowEntry { ref: string; reason: string }

/**
 * Identifiers read by engine code rather than by content conditions. Each `source` must still contain the
 * literal `id` (tests/content/dead.test.ts), so an entry cannot outlive the engine read it stands for.
 */
export const ENGINE_READS: ReadonlyArray<{ id: string; source: string }> = [
  { id: 'briefing.anchor', source: 'src/engine/odds.ts' },
  { id: 'briefing.loaded_lines', source: 'src/engine/day/legs.ts' },
];

function effectsOf(c: Content): Effect[] {
  const fromEvents = c.events.flatMap((ev) => ev.options.flatMap((o) => [o.effects, o.success, o.fail]));
  const fromManeuvers = c.maneuvers.flatMap((m) => m.errors.map((e) => e.effect));
  return [...fromEvents, ...fromManeuvers].filter((e): e is Effect => e !== undefined);
}

/** Every identifier some condition, chance modifier, option `requires`, `mitigatedBy` or engine read consumes. */
function readIdentifiers(c: Content): Set<string> {
  const reads = new Set<string>(ENGINE_READS.map((r) => r.id));
  const expr = (src: string): void => conditionIdentifiers(src).forEach((id) => reads.add(id));
  for (const ev of c.events) {
    ev.trigger.conditions.forEach(expr);
    if (typeof ev.trigger.chance !== 'number') {
      for (const m of ev.trigger.chance.mods ?? []) {
        if (m.if) expr(m.if);
        if (m.per) reads.add(m.per);
      }
    }
    ev.voices.forEach((l) => { if (l.when) expr(l.when); });
    ev.options.forEach((o) => (o.requires ?? []).forEach(expr));
  }
  for (const m of c.maneuvers) for (const e of m.errors) if (e.mitigatedBy) reads.add(e.mitigatedBy);
  return reads;
}

function findDeadRefs(c: Content): string[] {
  const reads = readIdentifiers(c);
  const written = new Set(effectsOf(c).flatMap((e) => (e.flag ? [`flag.${e.flag}`] : [])));
  const defects = c.boats.flatMap((b) => b.hiddenDefects);
  const dead: string[] = [];
  for (const w of written) if (!reads.has(w)) dead.push(`flag:${w.slice('flag.'.length)}`);
  for (const r of reads) if (r.startsWith('flag.') && !written.has(r)) dead.push(`flag-read:${r.slice('flag.'.length)}`);
  for (const cp of CHECKPOINTS) {
    if (!defects.some((d) => d.checkpoint === cp) && !reads.has(`checkin.${cp}`)) dead.push(`checkpoint:${cp}`);
  }
  for (const t of c.briefing) if (!reads.has(`briefing.${t.id}`)) dead.push(`topic:${t.id}`);
  for (const id of new Set(defects.map((d) => d.id))) {
    const charged = defects.some((d) => d.id === id && d.chargedOnReturn);
    if (!charged && !reads.has(`defect.${id}`) && !reads.has(`defect.${id}.found`)) dead.push(`defect:${id}`);
  }
  for (const key of BOAT_KEYS) if (!reads.has(key)) dead.push(`boat-field:${key}`);
  return dead;
}

/** Content nobody reads, minus the allowlist; stale allowlist entries are errors too. */
export function findDeadContent(c: Content, allow: ReadonlyArray<DeadAllowEntry>): ContentError[] {
  const dead = findDeadRefs(c);
  const allowed = new Set(allow.map((a) => a.ref));
  const err = (path: string, message: string): ContentError => ({ file: 'cross', path, message });
  return [
    ...dead.filter((ref) => !allowed.has(ref)).map((ref) => err(ref, 'dead content: nothing reads it (wire it up, remove it, or allowlist it)')),
    ...allow.filter((a) => !dead.includes(a.ref)).map((a) => err(`allow:${a.ref}`, 'stale allowlist entry: this content is no longer dead')),
  ];
}
