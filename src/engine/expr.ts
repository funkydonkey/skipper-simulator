import { EngineError } from './errors';
import { requireTemplate } from './state';
import { systemContext } from './systems';
import type { Content, GameState } from './types';
import { situationContext } from './situation-context';
import { realWind } from './weather';

export type CondValue = number | boolean | string;
export type CondContext = Readonly<Record<string, CondValue>>;

/** Dotted identifiers with these prefixes default to false when absent from context. */
export const FLAG_PREFIXES = ['checkin.', 'briefing.', 'flag.', 'defect.', 'damage.', 'wish.'] as const;
export const CONTEXT_KEYS = [
  'day', 'hour', 'water', 'water_pct', 'fuel', 'fuel_pct', 'service_bank', 'starter_bank', 'gas', 'money',
  'mood', 'fatigue', 'injuries', 'wind', 'gust', 'front', 'location_kind', 'at_base', 'at_marina', 'at_bay', 'at_quay',
  'moored_berth', 'night', 'place.seabed', 'marina.late', 'day.motor_hours', 'day.sail_hours', 'day.max_wind',
  'wind.side', 'wind.kn', 'wind.dir', 'place.marinero', 'place.tight', 'place.berth',
  'leg.feature.strait', 'leg.feature.cape', 'leg.feature.gulf', 'leg.feature.open',
] as const;
export const BOAT_KEYS = ['boat.shared_bank', 'boat.electric_toilet'] as const;

type Token =
  | { t: 'num'; v: number } | { t: 'str'; v: string } | { t: 'id'; v: string }
  | { t: 'op'; v: string } | { t: 'lp' } | { t: 'rp' };
type Node =
  | { k: 'lit'; v: CondValue } | { k: 'id'; name: string }
  | { k: 'not'; e: Node } | { k: 'bin'; op: string; l: Node; r: Node };

const TWO_CHAR_OPS = ['>=', '<=', '==', '!=', '&&', '||'];
const CMP_OPS = ['>=', '<=', '==', '!=', '>', '<'];

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const rest = src.slice(i);
    const c = rest[0]!;
    if (/\s/.test(c)) { i += 1; continue; }
    if (c === '(' || c === ')') { tokens.push({ t: c === '(' ? 'lp' : 'rp' }); i += 1; continue; }
    const two = rest.slice(0, 2);
    if (TWO_CHAR_OPS.includes(two)) { tokens.push({ t: 'op', v: two }); i += 2; continue; }
    if ('<>!'.includes(c)) { tokens.push({ t: 'op', v: c }); i += 1; continue; }
    const num = /^-?\d+(\.\d+)?/.exec(rest);
    if (num) { tokens.push({ t: 'num', v: Number(num[0]) }); i += num[0].length; continue; }
    const str = /^'([^']*)'/.exec(rest);
    if (str) { tokens.push({ t: 'str', v: str[1]! }); i += str[0].length; continue; }
    const id = /^[a-zA-Z_][\w.]*/.exec(rest);
    if (id) { tokens.push({ t: 'id', v: id[0] }); i += id[0].length; continue; }
    throw new EngineError('CONTENT', `Unexpected '${c}' at ${i} in condition "${src}"`);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[], private readonly src: string) {}

  parse(): Node {
    const node = this.or();
    if (this.pos < this.tokens.length) this.fail('Unexpected trailing tokens');
    return node;
  }
  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private isOp(v: string): boolean { const t = this.peek(); return t?.t === 'op' && t.v === v; }
  private fail(msg: string): never { throw new EngineError('CONTENT', `${msg} in condition "${this.src}"`); }
  private or(): Node {
    let l = this.and();
    while (this.isOp('||')) { this.pos += 1; l = { k: 'bin', op: '||', l, r: this.and() }; }
    return l;
  }
  private and(): Node {
    let l = this.unary();
    while (this.isOp('&&')) { this.pos += 1; l = { k: 'bin', op: '&&', l, r: this.unary() }; }
    return l;
  }
  private unary(): Node {
    if (this.isOp('!')) { this.pos += 1; return { k: 'not', e: this.unary() }; }
    return this.cmp();
  }
  private cmp(): Node {
    const l = this.primary();
    const t = this.peek();
    if (t?.t === 'op' && CMP_OPS.includes(t.v)) { this.pos += 1; return { k: 'bin', op: t.v, l, r: this.primary() }; }
    return l;
  }
  private primary(): Node {
    const t = this.peek();
    if (!t) this.fail('Unexpected end');
    this.pos += 1;
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') return t.v === 'true' || t.v === 'false' ? { k: 'lit', v: t.v === 'true' } : { k: 'id', name: t.v };
    if (t.t === 'lp') {
      const e = this.or();
      if (this.peek()?.t !== 'rp') this.fail('Missing )');
      this.pos += 1;
      return e;
    }
    this.fail('Unexpected token');
  }
}

const cache = new Map<string, Node>();
function compile(src: string): Node {
  const hit = cache.get(src);
  if (hit) return hit;
  const node = new Parser(tokenize(src), src).parse();
  cache.set(src, node);
  return node;
}

const truthy = (v: CondValue): boolean => v !== false && v !== 0 && v !== '';

function lookup(name: string, ctx: CondContext, src: string): CondValue {
  const v = ctx[name];
  if (v !== undefined) return v;
  if (FLAG_PREFIXES.some((p) => name.startsWith(p))) return false;
  throw new EngineError('CONTENT', `Unknown identifier "${name}" in condition "${src}"`);
}

/** Numeric context lookup with the same rules as conditions (unknown ids throw CONTENT). */
export function lookupNumber(ctx: CondContext, key: string): number {
  const v = lookup(key, ctx, key);
  if (typeof v !== 'number') throw new EngineError('CONTENT', `Identifier "${key}" is not a number`);
  return v;
}

function evalNode(n: Node, ctx: CondContext, src: string): CondValue {
  switch (n.k) {
    case 'lit': return n.v;
    case 'id': return lookup(n.name, ctx, src);
    case 'not': return !truthy(evalNode(n.e, ctx, src));
    case 'bin': {
      if (n.op === '&&') return truthy(evalNode(n.l, ctx, src)) && truthy(evalNode(n.r, ctx, src));
      if (n.op === '||') return truthy(evalNode(n.l, ctx, src)) || truthy(evalNode(n.r, ctx, src));
      const l = evalNode(n.l, ctx, src);
      const r = evalNode(n.r, ctx, src);
      if (n.op === '==') return l === r;
      if (n.op === '!=') return l !== r;
      if (typeof l !== 'number' || typeof r !== 'number') {
        throw new EngineError('CONTENT', `Operator ${n.op} needs numbers in condition "${src}"`);
      }
      if (n.op === '>=') return l >= r;
      if (n.op === '<=') return l <= r;
      return n.op === '>' ? l > r : l < r;
    }
  }
}

export function parseCondition(src: string): void {
  compile(src);
}

export function evaluateCondition(src: string, ctx: CondContext): boolean {
  return truthy(evalNode(compile(src), ctx, src));
}

export function evaluateAll(conds: readonly string[], ctx: CondContext): boolean {
  return conds.every((c) => evaluateCondition(c, ctx));
}

export function conditionIdentifiers(src: string): string[] {
  const out = new Set<string>();
  const walk = (n: Node): void => {
    if (n.k === 'id') out.add(n.name);
    else if (n.k === 'not') walk(n.e);
    else if (n.k === 'bin') { walk(n.l); walk(n.r); }
  };
  walk(compile(src));
  return [...out];
}

export function buildConditionContext(state: GameState, content: Content): CondContext {
  const boat = content.boats.find((b) => b.id === state.boatId);
  const point = content.map.find((p) => p.id === state.locationId);
  const r = state.resources;
  const w = state.weather;
  const wind = w ? realWind(w, 1, state.clockMin / 60, requireTemplate(content, state.weatherTemplateId), content.balance) : null;
  const anchoredOutside = state.dayFacts?.mooring === 'anchor';
  const ctx: Record<string, CondValue> = {
    day: state.day,
    hour: state.clockMin / 60,
    water: r.waterL,
    water_pct: boat ? (r.waterL / boat.waterTankL) * 100 : 0,
    fuel: r.fuelL,
    fuel_pct: boat ? (r.fuelL / boat.fuelTankL) * 100 : 0,
    service_bank: r.serviceBankPct,
    starter_bank: r.starterBankPct,
    gas: r.gasPct,
    money: r.moneyEur,
    mood: r.mood,
    fatigue: r.fatigue,
    injuries: state.injuries,
    wind: wind?.windKn ?? 0,
    gust: wind?.gustKn ?? 0,
    front: w?.front ?? false,
    location_kind: point?.kind ?? '',
    at_base: point?.kind === 'base',
    at_marina: (point?.kind === 'marina' || point?.kind === 'base') && !anchoredOutside,
    moored_berth: state.dayFacts?.mooring === 'berth',
    at_bay: point?.kind === 'bay',
    at_quay: point?.kind === 'quay',
    night: state.clockMin >= content.balance.time.sunsetHour * 60,
    'place.seabed': point?.seabed ?? '',
    // The marina refusal roll sets this per call.
    'marina.late': false,
    'day.motor_hours': state.dayFacts?.motorHours ?? 0,
    'day.sail_hours': state.dayFacts?.sailHours ?? 0,
    'day.max_wind': state.dayFacts?.maxWindKn ?? 0,
    'boat.shared_bank': boat ? !boat.starterSeparate : false,
    'boat.electric_toilet': boat?.electricToilet ?? false,
    // Passage events roll per leg and override these with the leg's route features.
    'leg.feature.strait': false, 'leg.feature.cape': false, 'leg.feature.gulf': false, 'leg.feature.open': false,
    ...systemContext(state, content),
    ...situationContext(state.situation),
    // Without a situation the wind keys carry the day's plain wind (kLocal 1).
    ...(state.situation ? {} : { 'wind.kn': wind?.windKn ?? 0, 'wind.dir': wind?.dir ?? '' }),
  };
  for (const [k, v] of Object.entries(state.flags)) ctx[k] = v;
  for (const d of state.damages) ctx[`damage.${d}`] = true;
  for (const m of state.crew) {
    const a = content.crew.find((c) => c.id === m.archetypeId);
    for (const wish of a?.wishes ?? []) ctx[`wish.${wish}`] = true;
  }
  for (const [v, lvl] of Object.entries(state.voices)) ctx[`voice.${v}`] = lvl;
  return ctx;
}
