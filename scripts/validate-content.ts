import { resolve } from 'node:path';
import { loadContentDir } from '../src/content/load-node';
import { formatErrors } from '../src/content/parse';

const dir = resolve(process.argv[2] ?? 'content');
const { content, errors } = await loadContentDir(dir);
if (!content) {
  console.error(`Content invalid (${errors.length} errors):\n${formatErrors(errors)}`);
  process.exit(1);
}
console.log(`Content OK: ${content.boats.length} boats, ${content.map.length} points, ${content.events.length} events`);
