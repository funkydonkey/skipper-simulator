import balance from '../../content/balance.json';
import boats from '../../content/boats.json';
import briefing from '../../content/briefing.json';
import crew from '../../content/crew.json';
import debrief from '../../content/debrief.json';
import dialogues from '../../content/dialogues.json';
import events from '../../content/events.json';
import maneuvers from '../../content/maneuvers.json';
import map from '../../content/map.json';
import routes from '../../content/routes.json';
import weather from '../../content/weather.json';
import { parseContent, type ParseResult } from '../content/parse';

/** Content bundled by Vite at build time and validated on start (ТЗ 5.3). */
export function loadBundledContent(): ParseResult {
  return parseContent({ boats, map, routes, weather, crew, briefing, events, dialogues, debrief, maneuvers, balance });
}
