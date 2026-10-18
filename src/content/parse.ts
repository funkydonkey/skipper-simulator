import { z } from 'zod';
import type { Content } from '../engine/types';
import {
  BalanceSchema, BoatSchema, BriefingTopicSchema, CrewArchetypeSchema, DebriefRuleSchema, DialogueSchema,
  GameEventSchema, ManeuverSchema, MapPointSchema, RouteSchema, WeatherTemplateSchema,
} from './schema';
import { crossValidate } from './validate';

export const CONTENT_FILES = ['boats', 'map', 'routes', 'weather', 'crew', 'briefing', 'events', 'dialogues', 'debrief', 'maneuvers', 'balance'] as const;
export type ContentFile = (typeof CONTENT_FILES)[number];
export interface ContentError { file: ContentFile | 'cross'; path: string; message: string }
export interface ParseResult { content: Content | null; errors: ContentError[] }

const FILE_SCHEMAS: Record<ContentFile, z.ZodTypeAny> = {
  boats: z.array(BoatSchema).min(1),
  map: z.array(MapPointSchema).min(2),
  routes: z.array(RouteSchema).min(1),
  weather: z.array(WeatherTemplateSchema).min(1),
  crew: z.array(CrewArchetypeSchema).min(1),
  briefing: z.array(BriefingTopicSchema),
  events: z.array(GameEventSchema),
  dialogues: z.array(DialogueSchema),
  debrief: z.array(DebriefRuleSchema),
  maneuvers: z.array(ManeuverSchema),
  balance: BalanceSchema,
};

export function parseContent(raw: Partial<Record<ContentFile, unknown>>): ParseResult {
  const errors: ContentError[] = [];
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
  const content = parsed as unknown as Content;
  const cross = crossValidate(content);
  return cross.length ? { content: null, errors: cross } : { content, errors: [] };
}

export function formatErrors(errors: readonly ContentError[]): string {
  return errors.map((e) => `[${e.file}] ${e.path || '(root)'}: ${e.message}`).join('\n');
}
