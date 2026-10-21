import { describe, expect, it } from 'vitest';
import { loadContentDir } from '../../src/content/load-node';
import { crossValidate } from '../../src/content/validate';
import { eventTexts } from '../../src/engine/events';
import type { Content, GameEvent, LocalizedText } from '../../src/engine/types';

const { content } = await loadContentDir('content');
const c = content!;
const withText = (text: GameEvent['text']): Content => ({ ...c, events: [{ ...c.events[0]!, text }, ...c.events.slice(1)] });
const msgs = (x: Content) => crossValidate(x).map((e) => e.message);
const t = (ru: string, en: string): LocalizedText => ({ ru, en });

describe('crew names in content', () => {
  it('bundled content validates', () => {
    expect(crossValidate(c)).toEqual([]);
  });

  it('rejects a literal crew name in an event text (RU and EN, whole word)', () => {
    expect(msgs(withText(t('Света бледнеет.', 'Fine.'))).join()).toMatch(/Света/);
    expect(msgs(withText(t('Всё хорошо.', 'Sveta is pale.'))).join()).toMatch(/Sveta/);
  });

  it('rejects a name hidden in a later text variant', () => {
    expect(msgs(withText([t('Ок.', 'Ok.'), t('Олег кричит.', 'Fine.')])).join()).toMatch(/Олег/);
  });

  it('rejects names in voice lines and option texts', () => {
    const ev = c.events[0]!;
    const voiced = { ...c, events: [{ ...ev, voices: [{ ...ev.voices[0]!, text: t('Аня, стой!', 'Stop.') }, ...ev.voices.slice(1)] }, ...c.events.slice(1)] };
    expect(msgs(voiced).join()).toMatch(/Аня/);
    const opt = { ...c, events: [{ ...ev, options: [{ ...ev.options[0]!, text: t('Ок', 'Tell Max') }, ...ev.options.slice(1)] }, ...c.events.slice(1)] };
    expect(msgs(opt).join()).toMatch(/Max/);
  });

  it('does not flag a name inside a longer word', () => {
    expect(msgs(withText(t('Максимум усилий.', 'Maxim effort.')))).toEqual([]);
  });

  it('rejects an unknown role and a malformed placeholder, accepts known ones', () => {
    expect(msgs(withText(t('{crew.role:pirate} орёт.', 'Ok.'))).join()).toMatch(/pirate/);
    expect(msgs(withText(t('{crew.who} орёт.', 'Ok.'))).join()).toMatch(/who/);
    expect(msgs(withText(t('{crew.any} и {crew.role:sailor}.', '{crew.role:guest} waves.')))).toEqual([]);
  });

  it('bundled events contain no literal crew names', () => {
    const all = c.crew.flatMap((a) => a.names.flatMap((n) => [n.ru, n.en]));
    for (const e of c.events) {
      const texts = [...eventTexts(e), ...e.voices.map((v) => v.text), ...e.options.map((o) => o.text), ...(e.debrief ? [e.debrief] : [])];
      for (const tx of texts) for (const n of all) expect(`${tx.ru} ${tx.en}`, `${e.id}: ${n}`).not.toMatch(new RegExp(`(?<![\\p{L}\\p{N}])${n}(?![\\p{L}\\p{N}])`, 'u'));
    }
  });
});
