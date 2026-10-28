import { describe, expect, it } from 'vitest';
import { damageSummary, resourceRows } from '../../../src/ui/view/resources';
import { content, gameAt } from '../fixtures';

describe('resourceRows', () => {
  const game = gameAt('morning');

  it('gives rough readouts without Mechanic and exact ones with it', () => {
    const rough = resourceRows({ ...game, voices: { ...game.voices, mechanic: 0 } }, content, 'ru');
    const exact = resourceRows({ ...game, voices: { ...game.voices, mechanic: 4 } }, content, 'ru');
    expect(rough.find((r) => r.key === 'waterL')!.value).toMatch(/^~\d+ л$/);
    expect(exact.find((r) => r.key === 'waterL')!.value).toMatch(/^\d+ л$/);
  });

  it('colours low and critical levels, fatigue inverted', () => {
    const tired = { ...game, resources: { ...game.resources, waterL: 1, fatigue: 95, mood: 25 } };
    const rows = resourceRows(tired, content, 'en');
    expect(rows.find((r) => r.key === 'waterL')!.level).toBe('critical');
    expect(rows.find((r) => r.key === 'fatigue')!.level).toBe('critical');
    expect(rows.find((r) => r.key === 'mood')!.level).toBe('low');
    expect(rows.find((r) => r.key === 'waterL')!.label).toBe('Water');
  });

  it('lists all eight resources', () => {
    expect(resourceRows(game, content, 'ru').map((r) => r.key)).toEqual(
      ['waterL', 'fuelL', 'serviceBankPct', 'starterBankPct', 'gasPct', 'moneyEur', 'mood', 'fatigue'],
    );
  });

  describe('damageSummary', () => {
    const sys = (id: string, over: object) => ({ ...game.systems, [id]: { ...game.systems[id]!, ...over } });
    const id = Object.keys(game.systems)[0]!;
    const name = content.systems.find((d) => d.id === id)!.name.ru.toLowerCase();

    const allOk = Object.fromEntries(Object.entries(game.systems).map(([k, v]) => [k, { ...v, state: 'ok' as const, broken: false }]));
    it('says there is no damage only when hull and systems are fine', () => {
      expect(damageSummary({ ...game, damages: [], systems: allOk }, content, 'ru')).toBe('Повреждений нет');
    });

    it('lists broken and worn systems next to the damages', () => {
      const broken = damageSummary({ ...game, damages: ['hull_scratch'], systems: { ...allOk, ...sys(id, { broken: true }) } }, content, 'ru');
      expect(broken).toContain('Царапина на корпусе');
      expect(broken).toContain(`Сломано: ${name}`);
      expect(broken).not.toContain('Повреждений нет');
      expect(damageSummary({ ...game, damages: [], systems: { ...allOk, ...sys(id, { state: 'worn', broken: false }) } }, content, 'en')).toMatch(/^Worn: /);
    });
  });
});
