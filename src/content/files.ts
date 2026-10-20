/** JSON files of the shared core pack: content/core/<name>.json */
export const CORE_FILES = ['boats', 'crew', 'briefing', 'dialogues', 'debrief', 'maneuvers', 'balance'] as const;
/** JSON files of a region pack: content/regions/<id>/<name>.json (weather templates live in weather/*.json). */
export const REGION_FILES = ['region', 'events'] as const;
/** Weather templates are one file per template in content/regions/<id>/weather/. */
export const WEATHER_DIR = 'weather';

export const CONTENT_FILES = [...CORE_FILES, ...REGION_FILES, 'weather'] as const;
export type ContentFile = (typeof CONTENT_FILES)[number];

/** Core-pack allowlist of dead content (content/core/dead-content-allow.json); loaded beside, not as, a content file. */
export const DEAD_ALLOW_FILE = 'dead-content-allow';
