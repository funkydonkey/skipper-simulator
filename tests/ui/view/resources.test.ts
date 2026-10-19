import { describe, expect, it } from 'vitest';
import { resourceRows } from '../../../src/ui/view/resources';
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
});
