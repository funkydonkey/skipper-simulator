import { describe, expect, it } from 'vitest';
import { startDay, type LogEntry } from '../../../src/engine';
import { runWeek } from '../../../src/sim/run';
import { expert, newbie } from '../../../src/sim/strategies';
import { dayLines, describeEntry, isLogbookOnly, isNoise, logbookDays } from '../../../src/ui/view/logbook';
import { content, gameAt } from '../fixtures';

const entry = (cause: string, extra: Partial<LogEntry> = {}): LogEntry => ({ day: 2, clockMin: 600, kind: 'decision', cause, ...extra });

describe('logbook', () => {
  it('describes every entry of real weeks in both languages without raw placeholders', () => {
    for (const strategy of [expert, newbie]) {
      for (const seed of [1, 2, 3, 42]) {
        const { state } = runWeek(content, seed, strategy);
        for (const e of state.log) {
          for (const lang of ['ru', 'en'] as const) {
            const line = describeEntry(e, content, lang);
            if (!line) continue;
            expect(line.text, e.cause).not.toMatch(/\{\w+\}|undefined|NaN/);
            expect(line.text.length, e.cause).toBeGreaterThan(3);
            expect(line.text, `no describer for ${e.cause}`).not.toMatch(/^(Запись|Entry):/);
          }
        }
      }
    }
  });

  it('shows what was said and what the crew heard', () => {
    const line = describeEntry(entry('dialogue:early_try'), content, 'ru')!;
    expect(line.text).toContain('Постараемся выйти пораньше');
    expect(line.text).toContain('Выходим в 8');
  });

  it('hides unseen front signals and hidden defects from the in-game logbook, but still describes them', () => {
    const unseen = entry('signal:front', { kind: 'signal', data: { seen: false, barometerTrendHpa: -4, frontAddKn: 10 } });
    expect(isNoise(unseen)).toBe(true);
    expect(describeEntry(unseen, content, 'ru')).not.toBeNull();
    expect(isNoise({ ...unseen, data: { seen: true, barometerTrendHpa: -4, frontAddKn: 10 } })).toBe(false);
    expect(isNoise(entry('defect:hidden:worn_impeller', { kind: 'info' }))).toBe(true);
    expect(isNoise(entry('checkin:skip:toilets'))).toBe(true);
    expect(describeEntry(entry('checkin:skip:toilets'), content, 'en')!.text).toContain('Heads');
  });

  it('describes voice-check rolls with their odds', () => {
    const ev = content.events.find((x) => x.options.some((o) => o.check))!;
    const opt = ev.options.find((o) => o.check)!;
    const odds = { value: 0.42, parts: [{ source: 'base', delta: 0.42 }] };
    const passed = entry(`roll:check:${ev.id}:${opt.id}`, { kind: 'roll', odds, data: { hit: true, success: true, chance: 0.42 } });
    const line = describeEntry(passed, content, 'en')!;
    expect(line).toMatchObject({ tone: 'good', kind: 'roll', odds });
    expect(line.text).toContain('42');
    expect(describeEntry({ ...passed, data: { hit: false, success: false, chance: 0.42 } }, content, 'en')!.tone).toBe('bad');
  });

  it('describes the other rolls with outcome and percent, in both languages', () => {
    const odds = { value: 0.35, parts: [{ source: 'base', delta: 0.35 }] };
    const roll = (cause: string, hit: boolean) => entry(cause, { kind: 'roll', odds, data: { hit } });
    const cases: Array<[string, boolean, string, string]> = [
      ['roll:front:2', true, 'Фронт пришёл', 'front'],
      ['roll:front:2', false, 'Фронт обошёл', 'front'],
      ['roll:anchor:1', true, 'Якорь не схватил', 'anchor'],
      ['roll:marina:base_marina', true, 'мест нет', 'marina'],
      ['roll:sail_break:r', false, 'выдержал', 'sail'],
      ['roll:injury:reef:r', true, 'Травма', 'injury'],
      ['roll:injury:maneuver:m:e', false, 'без травмы', 'injury'],
    ];
    for (const [cause, hit, ru] of cases) {
      const l = describeEntry(roll(cause, hit), content, 'ru')!;
      expect(l.text, cause).toContain(ru);
      expect(l.text, cause).toContain('35%');
      expect(l.odds, cause).toEqual(odds);
      expect(describeEntry(roll(cause, hit), content, 'en')!.text, cause).toContain('35%');
    }
    expect(describeEntry(roll('roll:front:2', true), content, 'ru')!.tone).toBe('bad');
    expect(describeEntry(roll('roll:front:2', false), content, 'ru')!.tone).toBe('good');
    expect(describeEntry(roll('roll:mystery:1', true), content, 'ru')).toBeNull();
    const certain = entry('roll:marina:base_marina', { kind: 'roll', odds: { value: 0, parts: [{ source: 'base', delta: 0 }] }, data: { hit: false } });
    expect(describeEntry(certain, content, 'ru'), 'a 0% marina roll is not a roll worth logging').toBeNull();
  });

  it('shows xp lines with a readable cause', () => {
    const ev = content.events.find((x) => x.options.some((o) => o.check))!;
    const opt = ev.options.find((o) => o.check)!;
    const m = content.maneuvers[0]!;
    const err = m.errors[0]!;
    const xp = (cause: string, n = 3) => entry(`xp:order:${cause}`, { kind: 'info', data: { xp: n } });
    expect(isNoise(xp('x'))).toBe(false);
    const wrong = describeEntry(xp(`order:wrong:${m.id}:${err.id}`), content, 'ru')!;
    expect(wrong.text).toContain('+3 Порядок');
    expect(wrong.text).toContain(m.title.ru);
    expect(describeEntry(xp(`order:ok:${m.id}`, 1), content, 'en')!.text).toContain('+1 Order');
    expect(describeEntry(xp(`roll:check:${ev.id}:${opt.id}`), content, 'en')!.text).toContain(opt.text.en);
    expect(describeEntry(xp('whatever'), content, 'en')!.text).toBe('+3 Order');
  });

  it('describes level-ups and voice events in both languages', () => {
    expect(describeEntry(entry('levelup:order:3', { data: { from: 2, to: 3 } }), content, 'ru')!.text).toBe('⬆ Порядок 2 → 3');
    for (const lang of ['ru', 'en'] as const) {
      expect(describeEntry(entry('voice:economist:saved', { data: { eur: 4 } }), content, lang)!.text).toContain('4');
      expect(describeEntry(entry('voice:diplomat:softened', { data: { mood: 2 } }), content, lang)!.text).toContain('2');
      expect(describeEntry(entry('voice:sea_sense:front_seen'), content, lang)!.text.length).toBeGreaterThan(5);
    }
  });

  it('flags xp and non-check rolls as logbook-only', () => {
    expect(isLogbookOnly(entry('xp:order:x'))).toBe(true);
    expect(isLogbookOnly(entry('roll:front:2'))).toBe(true);
    expect(isLogbookOnly(entry('roll:check:a:b'))).toBe(false);
    expect(isLogbookOnly(entry('levelup:order:2'))).toBe(false);
  });

  it('marks good and bad outcomes', () => {
    expect(describeEntry(entry('promise:early_try:broken', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
    expect(describeEntry(entry('promise:early_try:kept', { kind: 'effect' }), content, 'ru')!.tone).toBe('good');
    expect(describeEntry(entry('marina:refused', { kind: 'effect' }), content, 'ru')!.tone).toBe('bad');
  });

  it('groups the visible log by day', () => {
    const { state } = runWeek(content, 42, expert);
    const days = logbookDays(state.log, content, 'ru');
    expect(days.map((d) => d.day)).toEqual([...new Set(days.map((d) => d.day))].sort((a, b) => a - b));
    expect(days.every((d) => d.lines.length > 0)).toBe(true);
  });
});

describe('logbook does not spoil the weather', () => {
  it('shows no front outcome in the planning phase when signals are hidden and the barometer is closed', () => {
    const outcomes = new Set<boolean>();
    for (const seed of Array.from({ length: 24 }, (_, i) => i + 1)) {
      const morning = gameAt('morning', seed);
      const blind = { ...morning, voices: { ...morning.voices, sea_sense: 0 } };
      const planning = startDay(blind, content, { openBarometer: false });
      expect(planning.weather?.signalsVisible).toBe(false);
      outcomes.add(planning.weather?.front === true);
      for (const lang of ['ru', 'en'] as const) {
        const texts = dayLines(planning.log, planning.day, content, lang).map((l) => l.text).join('\n');
        expect(texts, `seed ${seed}`).not.toMatch(/Фронт пришёл|Фронт обошёл|front came|front passed/i);
      }
    }
    expect(outcomes.size, 'cover both a front day and a calm day').toBe(2);
  });
});

describe('logbook boat systems', () => {
  const text = (cause: string, lang: 'ru' | 'en', extra: Partial<LogEntry> = {}) => describeEntry(entry(cause, extra), content, lang)?.text;

  it('describes a failure, a tow and a marina without money', () => {
    expect(text('break:engine_cooling:impeller_overheat', 'ru')).toBe('Сломалось: охлаждение двигателя');
    expect(text('break:engine_cooling:impeller_overheat', 'en')).toBe('Broke down: engine cooling');
    expect(text('rescue:tow:r1', 'ru', { delta: { moneyEur: -250 }, data: { time_hours: 2 } })).toBe('Буксир: 250 €, +2 ч');
    expect(text('rescue:tow:r1', 'en', { delta: { moneyEur: -250 }, data: { time_hours: 2 } })).toBe('Tow: €250, +2 h');
    expect(text('marina:no_money', 'ru')).toBe('Марина: не хватило денег');
  });

  it('says "repaired" only for a successful repair, and keeps the payment out of the log', () => {
    expect(text('repair:gas:self:success', 'ru')).toBe('Починили: газ');
    expect(text('repair:gas:self:fail', 'ru')).toBe('Починить не вышло: газ');
    expect(text('repair:gas:self:success', 'en')).toBe('Repaired: gas');
    expect(text('repair:gas:self:fail', 'en')).toBe("Couldn't repair: gas");
    expect(isNoise(entry('repair:gas:self', { kind: 'effect' }))).toBe(true);
    expect(isNoise(entry('repair:gas:self:fail', { kind: 'effect' }))).toBe(false);
  });

  it('writes the windlass line naturally', () => {
    expect(text('system:anchor:windlass', 'ru')).toBe('Якорное устройство сломано: якорь вручную');
    expect(text('system:anchor:windlass', 'en')).toBe('Anchor gear broken: anchoring by hand');
  });

  it('describes check-in fixes and sail-on choices with the defect, and hides wear', () => {
    expect(text('checkin:fix:worn_impeller', 'ru', { delta: { moneyEur: -60 } })).toMatch(/^Починили на базе: .*Импеллер/);
    expect(text('checkin:sail_on:worn_impeller', 'en')).toMatch(/^Sailing on with: /);
    expect(isNoise(entry('wear:sail_hour', { kind: 'effect' }))).toBe(true);
  });

  it('explains xp from failures and repairs', () => {
    const xp = (cause: string) => text(`xp:mechanic:${cause}`, 'ru', { kind: 'info', data: { xp: 2 } });
    expect(xp('break:engine_cooling:impeller_overheat')).toContain('отказ');
    expect(xp('roll:check:repair:gas:self')).toContain('ремонт');
  });
});
