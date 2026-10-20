import { formatClock, type Content, type Lang, type LogEntry, type LogKind, type Pillar } from '../../engine';
import { CHECKPOINT_NAMES, DAMAGE_NAMES, label, VOICE_NAMES } from '../i18n/glossary';
import { fmt, type Vars } from '../i18n/t';
import { formatHour, signed } from './format';
import { pointName } from './map';
import { LOG, MODE_NAMES, SHOWER_NAMES, SIGNAL_NAMES } from './strings';

export type Tone = 'neutral' | 'good' | 'bad';
export interface LogLine { day: number; clock: string; text: string; tone: Tone; kind: LogKind; cause: string; pillar?: Pillar }

type Described = { text: string; tone?: Tone } | null;
type Describer = (parts: string[], e: LogEntry, c: Content, lang: Lang) => Described;
type LogKey = keyof typeof LOG;

const say = (key: LogKey, lang: Lang, vars: Vars = {}, tone: Tone = 'neutral'): Described => ({ text: fmt(LOG[key][lang], vars), tone });
const num = (e: LogEntry, k: string): number => Number(e.data?.[k] ?? 0);
const firstSentence = (s: string): string => s.split(/(?<=[.!?…])\s/)[0] ?? s;

function defectText(c: Content, id: string, lang: Lang): string {
  return c.boats.flatMap((b) => b.hiddenDefects).find((d) => d.id === id)?.description[lang] ?? label(DAMAGE_NAMES, id, lang);
}
function topicTitle(c: Content, id: string, lang: Lang): string {
  return c.briefing.find((t) => t.id === id)?.title[lang] ?? id;
}
function optionText(c: Content, eventId: string, optionId: string, lang: Lang): string {
  return c.events.find((e) => e.id === eventId)?.options.find((o) => o.id === optionId)?.text[lang] ?? optionId;
}
function maneuverTitle(c: Content, id: string, lang: Lang): string {
  return c.maneuvers.find((m) => m.id === id)?.title[lang] ?? id;
}
function routeName(c: Content, id: string, lang: Lang): string {
  const r = c.routes.find((x) => x.id === id);
  return r ? `${pointName(c, r.from, lang)} — ${pointName(c, r.to, lang)}` : id;
}

const DESCRIBE: Record<string, Describer> = {
  boat: ([, id = ''], _e, c, lang) => say('boatChosen', lang, { name: c.boats.find((b) => b.id === id)?.name[lang] ?? id }),
  checkin: ([verb, id = ''], _e, c, lang) => {
    if (verb === 'found') return say('defectFound', lang, { what: defectText(c, id, lang) }, 'good');
    return say(verb === 'check' ? 'checked' : 'skipped', lang, { what: label(CHECKPOINT_NAMES, id, lang) });
  },
  defect: ([, id = ''], _e, c, lang) => say('defectHidden', lang, { what: defectText(c, id, lang) }, 'bad'),
  briefing: ([verb, id = ''], _e, c, lang) => say(verb === 'topic' ? 'briefed' : 'notBriefed', lang, { what: topicTitle(c, id, lang) }),
  voices: () => null,
  dialogue: ([id = ''], _e, c, lang) => {
    const d = c.dialogues.find((x) => x.id === id);
    return d ? say('said', lang, { said: d.said[lang], heard: d.heard[lang] }) : null;
  },
  promise: ([id = '', status], _e, c, lang) => {
    const heard = c.dialogues.find((x) => x.id === id)?.heard[lang] ?? id;
    return status === 'kept' ? say('promiseKept', lang, { heard }, 'good') : say('promiseBroken', lang, { heard }, 'bad');
  },
  barometer: ([v], _e, _c, lang) => say(v === 'open' ? 'barometerOpen' : 'barometerIgnored', lang),
  signal: ([id = ''], e, _c, lang) => {
    if (id === 'front') return e.data?.seen === true ? say('frontSignalSeen', lang, { trend: num(e, 'barometerTrendHpa') }) : say('frontSignalMissed', lang);
    const known = SIGNAL_NAMES[id];
    return known ? { text: known[lang] } : say('signalGeneric', lang, { id });
  },
  weather: (_p, e, _c, lang) => say('frontArrived', lang, { wind: num(e, 'windKn') }, 'bad'),
  plan: ([what, v = ''], e, _c, lang) => {
    if (what === 'depart') return say('departPlanned', lang, { time: formatHour(num(e, 'hour')) });
    if (what === 'route') return say(v === 'busy' ? 'routeBusy' : 'routeEasy', lang, { nm: num(e, 'distanceNm'), legs: num(e, 'legs') });
    if (what === 'reefs') return say('reefs', lang, { n: v });
    if (what === 'shower') return say('shower', lang, { kind: SHOWER_NAMES[v as keyof typeof SHOWER_NAMES]?.[lang] ?? v });
    if (what === 'autopilot') return say('autopilot', lang);
    return null;
  },
  leg: ([routeId = ''], e, c, lang) => say('leg', lang, {
    route: routeName(c, routeId, lang),
    mode: MODE_NAMES[e.data?.mode === 'sail' ? 'sail' : 'motor'][lang],
    wind: num(e, 'windKn'), speed: num(e, 'speedKn'), hours: Math.round(num(e, 'hours') * 10) / 10,
  }),
  engine: () => null,
  zero: ([res], _e, _c, lang) => {
    const key = ({ starter: 'zeroStarter', fuel: 'zeroFuel', water: 'zeroWater', service: 'zeroService', gas: 'zeroGas' } as const)[res as 'fuel'];
    return key ? say(key, lang, {}, 'bad') : null;
  },
  order: ([ok, id = ''], _e, c, lang) => say(ok === 'ok' ? 'orderOk' : 'orderWrong', lang, { title: maneuverTitle(c, id, lang) }, ok === 'ok' ? 'good' : 'bad'),
  maneuver: ([mId, errId], _e, c, lang) => {
    const err = c.maneuvers.find((m) => m.id === mId)?.errors.find((x) => x.id === errId);
    return { text: err?.text[lang] ?? `${mId}: ${errId}`, tone: 'bad' };
  },
  injury: (_p, _e, _c, lang) => say('injury', lang, {}, 'bad'),
  fatigue: () => null,
  consumption: () => null,
  charge: () => null,
  refill: ([what], _e, _c, lang) => say(what === 'fuel' ? 'refillFuel' : what === 'gas' ? 'refillGas' : 'refillWater', lang),
  anchor: ([what, n = '1'], _e, _c, lang) => (what === 'dragging' ? say('anchorDragging', lang, {}, 'bad') : say('anchorAttempts', lang, { n })),
  marina: ([what], e, _c, lang) => (what === 'refused' ? say('marinaRefused', lang, {}, 'bad') : say('marinaFee', lang, { eur: Math.abs(e.delta?.moneyEur ?? 0) })),
  activity: ([what], _e, _c, lang) => {
    if (what === 'swim_skipped') return say('swimSkipped', lang, {}, 'bad');
    return say(what === 'taverna' ? 'taverna' : 'swim', lang, {}, 'good');
  },
  rest: (_p, e, _c, lang) => say('rest', lang, { mood: signed(e.delta?.mood ?? 0) }, 'good'),
  night: ([what], _e, _c, lang) => {
    if (what === 'rolly') return say('nightRolly', lang, {}, 'bad');
    return what === 'arrival' ? say('nightArrival', lang, {}, 'bad') : null;
  },
  sail: ([what], _e, _c, lang) => {
    const key = ({ overpowered: 'sailOverpowered', break: 'sailBreak', reef_underway: 'sailReefUnderway' } as const)[what as 'break'];
    return key ? say(key, lang, {}, 'bad') : null;
  },
  mood_per_day: (_p, e, _c, lang) => say('moodPerDay', lang, { mood: signed(e.delta?.mood ?? 0) }, 'bad'),
  event: ([eventId = '', optionId, tag], _e, c, lang) => {
    if (!optionId) return say('eventHappened', lang, { text: firstSentence(c.events.find((x) => x.id === eventId)?.text[lang] ?? eventId) });
    return say('eventOption', lang, { option: optionText(c, eventId, optionId, lang) }, tag === 'fail' ? 'bad' : tag === 'success' ? 'good' : 'neutral');
  },
  choice: ([eventId = '', optionId = ''], _e, c, lang) => say('chose', lang, { option: optionText(c, eventId, optionId, lang) }),
  /** Only voice checks are shown for now; the other rolls stay hidden until the odds UI lands. */
  roll: ([what, eventId = '', optionId = ''], e, c, lang) => {
    if (what !== 'check') return null;
    const voice = c.events.find((x) => x.id === eventId)?.options.find((o) => o.id === optionId)?.check?.voice;
    const vars = { voice: voice ? VOICE_NAMES[voice][lang] : '?', chance: Math.round(num(e, 'chance') * 100) };
    return e.data?.success === true ? say('checkPassed', lang, vars, 'good') : say('checkFailed', lang, vars, 'bad');
  },
  levelup: ([voice = ''], e, _c, lang) => say('levelUp', lang, { voice: VOICE_NAMES[voice as keyof typeof VOICE_NAMES]?.[lang] ?? voice, from: num(e, 'from'), to: num(e, 'to') }, 'good'),
  xp: () => null,
  return: ([what], e, _c, lang) => {
    if (what === 'late_fee') return say('lateFee', lang, { eur: Math.abs(e.delta?.moneyEur ?? 0) }, 'bad');
    return what === 'on_time' ? say('returnOnTime', lang, {}, 'good') : say('returnLate', lang, {}, 'bad');
  },
  deposit: ([, id = ''], _e, c, lang) => say('depositCharged', lang, { what: defectText(c, id, lang) }, 'bad'),
};

export function describeEntry(e: LogEntry, content: Content, lang: Lang): LogLine | null {
  const [root = '', ...parts] = e.cause.split(':');
  const describer = DESCRIBE[root];
  const d = describer ? describer(parts, e, content, lang) : say('unknown', lang, { cause: e.cause });
  if (!d) return null;
  return { day: e.day, clock: formatClock(e.clockMin), text: d.text, tone: d.tone ?? 'neutral', kind: e.kind, cause: e.cause, ...(e.pillar ? { pillar: e.pillar } : {}) };
}

const NOISE_ROOTS = new Set(['voices', 'engine', 'fatigue', 'consumption', 'charge', 'defect', 'choice', 'xp']);

/** Entries the captain did not witness or that only duplicate another line. Debrief still uses them. */
export function isNoise(e: LogEntry): boolean {
  const [root = '', verb] = e.cause.split(':');
  if (NOISE_ROOTS.has(root)) return true;
  if ((root === 'checkin' || root === 'briefing') && verb === 'skip') return true;
  if (root === 'plan' && verb === 'mode') return true;
  if (root === 'night' && verb === 'sleep') return true;
  return root === 'signal' && e.data?.seen === false;
}

export function dayLines(log: readonly LogEntry[], day: number, content: Content, lang: Lang): LogLine[] {
  return log.filter((e) => e.day === day && !isNoise(e)).flatMap((e) => describeEntry(e, content, lang) ?? []);
}

export function logbookDays(log: readonly LogEntry[], content: Content, lang: Lang): Array<{ day: number; lines: LogLine[] }> {
  const days = [...new Set(log.map((e) => e.day))].sort((a, b) => a - b);
  return days.map((day) => ({ day, lines: dayLines(log, day, content, lang) })).filter((d) => d.lines.length > 0);
}
