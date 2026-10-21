import { describe, expect, it } from 'vitest';
import { makeCrew, renderText } from '../../src/engine/crew';
import { newGame } from '../../src/engine/setup';
import type { Content, CrewArchetype } from '../../src/engine/types';
import { loadContentDir } from '../../src/content/load-node';
import { makeContent } from '../fixtures/content';
import { makeState } from '../fixtures/state';

const { content: bundled } = await loadContentDir('content');

describe('makeCrew', () => {
  const seeds = Array.from({ length: 100 }, (_, i) => i + 1);

  it('gives 4 members with unique names and varied archetype mixes over seeds 1..100', () => {
    const mixes = new Set<string>();
    for (const seed of seeds) {
      const crew = makeCrew(bundled!, 4, seed);
      expect(crew).toHaveLength(4);
      expect(new Set(crew.map((m) => m.name.ru)).size, `seed ${seed}`).toBe(4);
      mixes.add(crew.map((m) => m.archetypeId).join(','));
    }
    expect(mixes.size).toBeGreaterThan(3);
  });

  it('is deterministic and ids are crew_<n>', () => {
    expect(makeCrew(bundled!, 4, 9)).toEqual(makeCrew(bundled!, 4, 9));
    expect(makeCrew(bundled!, 4, 9).map((m) => m.id)).toEqual(['crew_1', 'crew_2', 'crew_3', 'crew_4']);
  });

  it('newGame keeps state.rng === seed', () => {
    expect(newGame(bundled!, { seed: 123, lang: 'ru' }).rng).toBe(123);
  });

  it('every archetype has a role and at least 5 names', () => {
    for (const a of bundled!.crew) {
      expect(a.role, a.id).toBeTruthy();
      expect(a.names.length, a.id).toBeGreaterThanOrEqual(5);
    }
    expect(bundled!.crew.map((a) => a.role).sort()).toEqual(['guest', 'sailor']);
  });
});

describe('renderText', () => {
  const content = makeContent();
  const withRoles: Content = { ...content, crew: content.crew.map((a): CrewArchetype => ({ ...a, role: a.id === 'party' ? 'guest' : 'sailor' })) };
  const state = makeState();

  it('{crew.any} is a crew member name in the state language, stable per key', () => {
    const a = renderText('{crew.any} молчит', state, withRoles, 'ev:3');
    expect(state.crew.map((m) => `${m.name.ru} молчит`)).toContain(a);
    expect(renderText('{crew.any} молчит', state, withRoles, 'ev:3')).toBe(a);
    expect(state.crew.map((m) => `${m.name.en} is silent`)).toContain(renderText('{crew.any} is silent', { ...state, lang: 'en' }, withRoles, 'ev:3'));
  });

  it('one key maps to one person across different placeholders and texts', () => {
    const [x, y] = [renderText('{crew.any}', state, withRoles, 'k:1'), renderText('Эй, {crew.any}!', state, withRoles, 'k:1')];
    expect(y).toBe(`Эй, ${x}!`);
  });

  it('different keys reach different members', () => {
    const picked = new Set(Array.from({ length: 40 }, (_, i) => renderText('{crew.any}', state, withRoles, `e:${i}`)));
    expect(picked.size).toBeGreaterThan(1);
  });

  it('{crew.role:sailor} picks a sailor', () => {
    const sailors = state.crew.filter((m) => m.archetypeId === 'sailor').map((m) => m.name.ru);
    for (let i = 0; i < 20; i++) expect(sailors).toContain(renderText('{crew.role:sailor}', state, withRoles, `e:${i}`));
  });

  it('{crew.role:sailor} with no sailor on board falls back to any member', () => {
    const guests = state.crew.filter((m) => m.archetypeId === 'party');
    const noSailor = { ...state, crew: guests };
    expect(guests.map((m) => m.name.ru)).toContain(renderText('{crew.role:sailor} ставит грот', noSailor, withRoles, 'e:1').replace(' ставит грот', ''));
  });

  it('leaves text without placeholders untouched', () => {
    expect(renderText('Ничего', state, withRoles, 'k')).toBe('Ничего');
  });
});

describe('presentEvent renders placeholders', () => {
  it('event text, voice lines and options share one person; the logbook key matches', async () => {
    const { presentEvent } = await import('../../src/engine/events');
    const { buildConditionContext } = await import('../../src/engine/expr');
    const content = makeContent();
    const c: Content = { ...content, crew: content.crew.map((a): CrewArchetype => ({ ...a, role: a.id === 'party' ? 'guest' : 'sailor' })) };
    const base = c.events[0]!;
    const ev = {
      ...base, id: 'named', text: { ru: '{crew.role:guest} молчит.', en: '{crew.role:guest} is silent.' },
      voices: [{ voice: 'caution' as const, min_level: 1, text: { ru: 'Следи за {crew.role:guest}.', en: 'Watch {crew.role:guest}.' } }],
      options: [{ ...base.options[0]!, text: { ru: 'Окликнуть: {crew.role:guest}', en: 'Hail {crew.role:guest}' } }],
    };
    const state = makeState({ day: 3 });
    const view = presentEvent(ev, state, buildConditionContext(state, c), c);
    const who = renderText('{crew.role:guest}', state, c, 'named:3');
    expect(view.text).toBe(`${who} молчит.`);
    expect(view.voices[0]!.text).toBe(`Следи за ${who}.`);
    expect(view.options[0]!.text).toBe(`Окликнуть: ${who}`);
    expect(JSON.stringify(view)).not.toContain('{crew');
  });
});
