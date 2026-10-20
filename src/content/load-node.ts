import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { CORE_FILES, REGION_FILES, WEATHER_DIR, type ContentFile } from './files';
import { parseContent, type ContentError, type ParseResult } from './parse';

type Raw = Partial<Record<ContentFile, unknown>>;

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8'));
}

/** Loads content/core plus content/regions/<regionId>. Problems are returned as errors, never thrown. */
export async function loadContentDir(dir: string, regionId = 'archipelago'): Promise<ParseResult> {
  const raw: Raw = {};
  const errors: ContentError[] = [];
  const read = async (file: ContentFile, path: string): Promise<void> => {
    try {
      raw[file] = await readJson(path);
    } catch (e) {
      errors.push({ file, path: '', message: `Cannot read ${path}: ${(e as Error).message}` });
    }
  };
  const regionDir = join(dir, 'regions', regionId);
  for (const file of CORE_FILES) await read(file, join(dir, 'core', `${file}.json`));
  for (const file of REGION_FILES) await read(file, join(regionDir, `${file}.json`));
  try {
    const names = (await readdir(join(regionDir, WEATHER_DIR))).filter((n) => n.endsWith('.json')).sort();
    raw.weather = await Promise.all(names.map((n) => readJson(join(regionDir, WEATHER_DIR, n))));
  } catch (e) {
    errors.push({ file: 'weather', path: '', message: `Cannot read ${join(regionDir, WEATHER_DIR)}: ${(e as Error).message}` });
  }
  return errors.length ? { content: null, errors } : parseContent(raw);
}
