import { z } from 'zod';
import type { Content, Region } from '../engine/types';
import {
  BalanceSchema, BoatSchema, BriefingTopicSchema, CrewArchetypeSchema, DeadAllowSchema, DebriefRuleSchema, DialogueSchema,
  GameEventSchema, ManeuverSchema, RegionSchema, SystemDefSchema, WeatherTemplateSchema,
} from './schema';
import { CONTENT_FILES, type ContentFile } from './files';
import { validateConditions } from './conditions';
import { crossValidate } from './validate';
import { findDeadContent } from './dead';

export { CONTENT_FILES, type ContentFile };
export interface ContentError { file: ContentFile | 'cross'; path: string; message: string }
export interface ParseResult { content: Content | null; errors: ContentError[] }

const FILE_SCHEMAS: Record<ContentFile, z.ZodTypeAny> = {
  boats: z.array(BoatSchema).min(1),
  region: RegionSchema,
  weather: z.array(WeatherTemplateSchema).min(1),
  crew: z.array(CrewArchetypeSchema).min(1),
  briefing: z.array(BriefingTopicSchema),
  events: z.array(GameEventSchema),
  dialogues: z.array(DialogueSchema),
  debrief: z.array(DebriefRuleSchema),
  maneuvers: z.array(ManeuverSchema),
  balance: BalanceSchema,
  systems: z.array(SystemDefSchema),
};

/** `deadAllow` (the parsed dead-content-allow.json) turns on the dead-content check; omit it for partial content. */
export function parseContent(raw: Partial<Record<ContentFile, unknown>>, deadAllow?: unknown): ParseResult {
  const errors: ContentError[] = [];
  const allow = deadAllow === undefined ? undefined : DeadAllowSchema.safeParse(deadAllow);
  if (allow && !allow.success) for (const issue of allow.error.issues) errors.push({ file: 'cross', path: `dead-content-allow.${issue.path.join('.')}`, message: issue.message });
  const parsed: Partial<Record<ContentFile, unknown>> = {};
  for (const file of CONTENT_FILES) {
    if (raw[file] === undefined) {
      errors.push({ file, path: '', message: 'missing file' });
      continue;
    }
    const r = FILE_SCHEMAS[file].safeParse(raw[file]);
    if (r.success) parsed[file] = r.data;
    else for (const issue of r.error.issues) errors.push({ file, path: issue.path.join('.'), message: issue.message });
  }
  if (errors.length) return { content: null, errors };
  const { region, ...rest } = parsed as unknown as { region: Region } & Omit<Content, 'region' | 'map' | 'routes'>;
  const content: Content = { ...rest, region: { id: region.id, name: region.name }, map: region.map, routes: region.routes };
  const cross = [...crossValidate(content), ...validateConditions(content)];
  if (!cross.length && allow?.success) cross.push(...findDeadContent(content, allow.data));
  return cross.length ? { content: null, errors: cross } : { content, errors: [] };
}

/** A region pack must describe the region it was loaded as: region.json `id` equals the requested region id. */
export function regionIdErrors(region: unknown, regionId: string): ContentError[] {
  const id = typeof region === 'object' && region !== null ? (region as { id?: unknown }).id : undefined;
  if (id === undefined || id === regionId) return [];
  return [{ file: 'region', path: 'id', message: `region id "${String(id)}" does not match the requested region "${regionId}"` }];
}

export function formatErrors(errors: readonly ContentError[]): string {
  return errors.map((e) => `[${e.file}] ${e.path || '(root)'}: ${e.message}`).join('\n');
}
