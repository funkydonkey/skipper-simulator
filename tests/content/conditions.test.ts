import { describe, expect, it } from 'vitest';
import { knownIdentifiers, validateConditions } from '../../src/content/conditions';
import { parseContent } from '../../src/content/parse';
import { makeContent } from '../fixtures/content';
import { toRaw } from '../fixtures/raw';

describe('condition validation', () => {
  it('fixture conditions are valid', () => {
    expect(validateConditions(makeContent())).toEqual([]);
  });

  it('knows flags derived from content', () => {
    const k = knownIdentifiers(makeContent());
    for (const id of ['day', 'voice.mechanic', 'checkin.toilets', 'briefing.toilet', 'defect.worn_impeller', 'defect.worn_impeller.found', 'damage.toilet_broken', 'damage.prop_line', 'wish.taverna', 'boat.shared_bank']) {
      expect(k.has(id), id).toBe(true);
    }
    expect(k.has('briefing.toilets')).toBe(false);
  });

  it('reports typos in flags (Review Focus #1)', () => {
    const c = makeContent();
    c.events[0]!.trigger.conditions = ['!briefing.toilets'];
    expect(validateConditions(c)).toEqual([{ file: 'cross', path: 'events[0].trigger.conditions[0]', message: 'Unknown identifier "briefing.toilets" in "!briefing.toilets"' }]);
  });

  it('reports syntax errors and bad requires / mitigatedBy', () => {
    const c = makeContent();
    c.events[0]!.trigger.conditions = ['day >='];
    c.events[0]!.options[1]!.requires = ['at_harbour'];
    c.maneuvers[0]!.errors[1]!.mitigatedBy = 'briefing.lines';
    const msgs = validateConditions(c).map((e) => `${e.path}: ${e.message}`);
    expect(msgs).toEqual([
      expect.stringMatching(/^events\[0\]\.trigger\.conditions\[0\]: .*Unexpected end/),
      'events[0].options[1].requires[0]: Unknown identifier "at_harbour" in "at_harbour"',
      'maneuvers[0].errors[1].mitigatedBy: Unknown identifier "briefing.lines"',
    ]);
  });

  it('validates the conditions and keys of a spec trigger chance', () => {
    const c = makeContent();
    c.events[0]!.trigger.chance = { base: 0.2, mods: [{ if: 'front && night', add: 0.1, label: 'wind' }, { per: 'voice.mechanic', add: -0.02 }] };
    expect(validateConditions(c)).toEqual([]);
    c.events[0]!.trigger.chance = { base: 0.2, mods: [{ if: 'fronts', add: 0.1, label: 'wind' }, { per: 'voice.mechanics', add: -0.02 }] };
    expect(validateConditions(c).map((e) => e.path)).toEqual(['events[0].trigger.chance.mods[0].if', 'events[0].trigger.chance.mods[1].per']);
  });

  it('parseContent runs condition validation', () => {
    const raw = toRaw(makeContent());
    raw.events[0].trigger.conditions = ['!briefing.toilets'];
    expect(parseContent(raw).errors).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/briefing\.toilets/) }));
  });
});
