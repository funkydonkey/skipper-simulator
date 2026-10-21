import { describe, expect, it } from 'vitest';
import { resolveDefects } from '../../src/engine/defects';
import { assignVoices, boatOffers, chooseBoat, newGame, performBriefing, performCheckin } from '../../src/engine/setup';
import { makeContent } from '../fixtures/content';
import { deepFreeze } from '../fixtures/freeze';

const content = makeContent();
const alloc = { sea_sense: 2, caution: 2, order: 2, mechanic: 2, diplomat: 2, economist: 2 };
const start = () => deepFreeze(newGame(content, { seed: 7, lang: 'ru' }));
const toCheckin = () => ({ ...chooseBoat(assignVoices(start(), content, alloc), content, 'test_boat'), defects: ['worn_impeller', 'old_scratch'] });
const toDefects = () => performCheckin(toCheckin(), content, ['impeller', 'toilets']);
const toBriefing = () => resolveDefects(toDefects(), content, []);
const topics = ['captain_only', 'cleats', 'loaded_lines', 'toilet'];

describe('setup phases', () => {
  it('newGame: captain phase at base with crew', () => {
    const s = start();
    expect(s).toMatchObject({ phase: 'captain', day: 0, locationId: 'base', boatId: null, seed: 7, rng: 7, weatherTemplateId: 'test_week' });
    expect(s.crew.map((m) => [m.archetypeId, m.name.ru])).toEqual([['party', 'Аня'], ['sailor', 'Ира'], ['party', 'Олег'], ['sailor', 'Макс']]);
    expect(s.resources).toMatchObject({ moneyEur: 6000, waterL: 0, fuelL: 0, mood: 70 });
    expect(() => newGame(content, { seed: 1, lang: 'en', crewSize: 0 })).toThrow(/crewSize/);
    expect(() => newGame(content, { seed: 1, lang: 'en', weatherTemplateId: 'nope' })).toThrow(/not found/);
  });

  it('assignVoices validates and advances', () => {
    const s = assignVoices(start(), content, alloc);
    expect(s.phase).toBe('boat_select');
    expect(s.voices.pride).toBe(2);
    expect(s.log.filter((e) => e.cause.startsWith('voices:'))).toHaveLength(6);
    expect(() => assignVoices(start(), content, { sea_sense: 4 })).toThrow(/sum must be 12/);
    expect(() => assignVoices(s, content, alloc)).toThrow(/Expected phase captain/);
  });

  it('boatOffers and chooseBoat', () => {
    const s = assignVoices(start(), content, alloc);
    expect(boatOffers(s, content)).toEqual([{ boat: content.boats[0], affordable: true }]);
    const chosen = chooseBoat(s, content, 'test_boat');
    expect(chosen).toMatchObject({ phase: 'checkin', boatId: 'test_boat', resources: { moneyEur: 2000, waterL: 300, fuelL: 150 } });
    expect(chosen.log.at(-1)).toMatchObject({ kind: 'decision', cause: 'boat:choose:test_boat', pillar: 'boat' });
    const pricey = { ...content, boats: [{ ...content.boats[0]!, priceEur: 9000 }] };
    expect(() => chooseBoat(s, pricey, 'test_boat')).toThrow(/afford/);
    expect(() => chooseBoat(s, content, 'ghost')).toThrow(/not found/);
  });

  it('performCheckin: time budget, flags, hidden defects, log', () => {
    const s = toDefects();
    expect(s.phase).toBe('defects');
    expect(s.flags).toMatchObject({ 'checkin.impeller': true, 'checkin.toilets': true, 'defect.worn_impeller.found': true, 'defect.old_scratch': true });
    expect(s.flags['defect.worn_impeller']).toBeUndefined();
    const causes = s.log.map((e) => e.cause);
    expect(causes).toContain('checkin:check:impeller');
    expect(causes).toContain('checkin:skip:damage_photos');
    expect(causes).toContain('checkin:found:worn_impeller');
    expect(causes).toContain('defect:hidden:old_scratch');
    expect(s.clockMin).toBe(toCheckin().clockMin + 35);
    expect(() => performCheckin(toCheckin(), content, ['anchor', 'impeller', 'gas', 'toilets', 'sails', 'electrics', 'damage_photos'])).toThrow(/120 min.*72/);
    expect(() => performCheckin(toCheckin(), content, ['gas', 'gas'])).toThrow(/duplicate/);
    expect(() => performCheckin(toCheckin(), content, ['radio' as never])).toThrow(/unknown checkpoint/);
  });

  it('performBriefing: exactly 4 topics, briefing dialogues, starts day 1', () => {
    const s = performBriefing(toBriefing(), content, topics, ['ten_bonus']);
    expect(s).toMatchObject({ phase: 'morning', day: 1, clockMin: 8 * 60 });
    expect(s.flags).toMatchObject({ 'briefing.captain_only': true, 'briefing.toilet': true });
    expect(s.expectations).toEqual([expect.objectContaining({ dialogueId: 'ten_bonus', dueDay: 1 })]);
    expect(s.log.map((e) => e.cause)).toEqual(expect.arrayContaining(['briefing:topic:cleats', 'briefing:skip:sails', 'dialogue:ten_bonus']));
    expect(() => performBriefing(toBriefing(), content, topics.slice(0, 3), [])).toThrow(/exactly 4/);
    expect(() => performBriefing(toBriefing(), content, ['sails', 'sails', 'mob', 'toilet'], [])).toThrow(/exactly 4/);
    expect(() => performBriefing(toBriefing(), content, ['sails', 'yoga', 'mob', 'toilet'], [])).toThrow(/unknown topic "yoga"/);
    expect(() => performBriefing(toBriefing(), content, topics, ['early_try', 'ten_bonus', 'decide_morning'])).toThrow(/at most 2/);
    expect(() => performBriefing(toBriefing(), content, topics, ['promise_taverna'])).toThrow(/cannot be said during briefing/);
  });
});
