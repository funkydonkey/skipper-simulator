import { otherEnd, type Content, type GameState, type Lang } from '../../../engine';
import { describeEntry, isLogbookOnly, isNoise, type LogLine } from '../../view/logbook';

/** Points sailed today, origin first, rebuilt backwards from today's `leg:` entries. */
export function todayTrail(game: GameState, content: Content): string[] {
  const legs = game.log.filter((e) => e.day === game.day && e.cause.startsWith('leg:')).map((e) => e.cause.slice('leg:'.length));
  const back = [game.locationId];
  for (const id of [...legs].reverse()) {
    const r = content.routes.find((x) => x.id === id);
    const prev = r ? otherEnd(r, back[back.length - 1]!) : null;
    if (!prev) break;
    back.push(prev);
  }
  return back.reverse();
}

/** What happened since the plan was made, minus noise and queued events (they come next). */
export function passageLines(game: GameState, content: Content, lang: Lang): LogLine[] {
  const today = game.log.filter((e) => e.day === game.day);
  const start = Math.max(0, today.findIndex((e) => e.cause.startsWith('plan:')));
  return today
    .slice(start)
    .filter((e) => !isNoise(e) && !isLogbookOnly(e) && e.kind !== 'event' && !e.cause.startsWith('plan:'))
    .flatMap((e) => describeEntry(e, content, lang, game.seed) ?? []);
}
