import balance from '../../content/core/balance.json';
import boats from '../../content/core/boats.json';
import briefing from '../../content/core/briefing.json';
import crew from '../../content/core/crew.json';
import debrief from '../../content/core/debrief.json';
import dialogues from '../../content/core/dialogues.json';
import maneuvers from '../../content/core/maneuvers.json';
import { parseContent, regionIdErrors, type ParseResult } from '../content/parse';

const regionFiles = import.meta.glob('../../content/regions/*/{region,events}.json', { eager: true, import: 'default' });
const weatherFiles = import.meta.glob('../../content/regions/*/weather/*.json', { eager: true, import: 'default' });

/** Files of one region from an eager glob, ordered by path (so weather is sorted by file name). */
function inRegion(files: Record<string, unknown>, regionId: string, name?: string): unknown[] {
  const prefix = `../../content/regions/${regionId}/`;
  return Object.keys(files).sort().filter((p) => p.startsWith(prefix) && (!name || p === `${prefix}${name}.json`)).map((p) => files[p]);
}

/**
 * Content bundled by Vite at build time and validated on start (ТЗ 5.3). Dead content is not checked here:
 * validate-content and the tests catch it before a build (spec §7.2).
 */
export function loadBundledContent(regionId = 'archipelago'): ParseResult {
  const [region] = inRegion(regionFiles, regionId, 'region');
  const [events] = inRegion(regionFiles, regionId, 'events');
  const weather = inRegion(weatherFiles, regionId);
  const mismatch = regionIdErrors(region, regionId);
  if (mismatch.length) return { content: null, errors: mismatch };
  return parseContent({ boats, crew, briefing, dialogues, debrief, maneuvers, balance, region, events, weather });
}
