import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CONTENT_FILES, parseContent, type ContentError, type ContentFile, type ParseResult } from './parse';

export async function loadContentDir(dir: string): Promise<ParseResult> {
  const raw: Partial<Record<ContentFile, unknown>> = {};
  const errors: ContentError[] = [];
  for (const file of CONTENT_FILES) {
    try {
      raw[file] = JSON.parse(await readFile(join(dir, `${file}.json`), 'utf8'));
    } catch (e) {
      errors.push({ file, path: '', message: `Cannot read ${file}.json: ${(e as Error).message}` });
    }
  }
  return errors.length ? { content: null, errors } : parseContent(raw);
}
