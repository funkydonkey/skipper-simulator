import { describe, expect, it } from 'vitest';
import {
  clearSave, memoryStorage, readLangPref, readSave, SAVE_KEY, shouldAutosave, writeLangPref, writeSave,
} from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';

const NOW = new Date('2026-10-19T10:00:00Z');

describe('save slot', () => {
  it('round-trips a game through storage', () => {
    const storage = memoryStorage();
    const game = gameAt('morning');
    expect(writeSave(storage, game, NOW)).toBe(true);
    const r = readSave(storage, content);
    expect(r).toEqual({ kind: 'ok', savedAt: NOW.toISOString(), game });
  });

  it('reports none, corrupt JSON, dangling references', () => {
    const storage = memoryStorage();
    expect(readSave(storage, content).kind).toBe('none');
    storage.setItem(SAVE_KEY, '{not json');
    expect(readSave(storage, content).kind).toBe('corrupt');
    const game = gameAt('morning');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, boatId: 'ghost_boat' } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    clearSave(storage);
    expect(readSave(storage, content).kind).toBe('none');
  });

  it('treats a stored version-2 slot as legacy and clears it', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...gameAt('morning'), version: 2 } }));
    expect(readSave(storage, content)).toEqual({ kind: 'legacy' });
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(readSave(storage, content).kind).toBe('none');
  });

  it('treats a stored version-3 slot as legacy and clears it', () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...gameAt('morning'), version: 3 } }));
    expect(readSave(storage, content)).toEqual({ kind: 'legacy' });
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });

  it('accepts a valid situation and rejects a malformed one', () => {
    const storage = memoryStorage();
    const game = gameAt('morning');
    const good = { berth: 'stern_to', windSide: 'port', windKn: 8, windDir: 'N', marinero: true, marineroOdds: null, seabed: 'mud', tight: false, source: 'fact' };
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, situation: good } }));
    expect(readSave(storage, content).kind).toBe('ok');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, situation: { ...good, berth: 'dock' } } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, situation: { berth: 'anchor' } } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
  });

  it('rejects a slot in the defects phase without a check-in, and accepts one with it', () => {
    const storage = memoryStorage();
    const game = gameAt('briefing');
    const bad = { ...game, phase: 'defects' as const, checkin: null };
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: bad }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    const good = { ...bad, checkin: { found: [], fixed: [], minutesLeft: 10 } };
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: good }));
    expect(readSave(storage, content).kind).toBe('ok');
  });

  it('rejects a slot whose system lacks wear', () => {
    const storage = memoryStorage();
    const game = gameAt('morning');
    const bad = { ...game, systems: { ...game.systems, rig: { state: 'ok', broken: false } } };
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: bad }));
    expect(readSave(storage, content).kind).toBe('corrupt');
  });

  it('reports a legacy v1 slot once and removes it', () => {
    const storage = memoryStorage();
    storage.setItem('skipper.save.v1', '{"anything":1}');
    expect(readSave(storage, content)).toEqual({ kind: 'legacy' });
    expect(storage.getItem('skipper.save.v1')).toBeNull();
    expect(readSave(storage, content).kind).toBe('none');
  });

  it('prefers a v2 slot over a legacy one', () => {
    const storage = memoryStorage();
    storage.setItem('skipper.save.v1', '{}');
    writeSave(storage, gameAt('morning'), NOW);
    expect(readSave(storage, content).kind).toBe('ok');
    expect(storage.getItem('skipper.save.v1'), 'the legacy key is cleared even when a v2 slot exists').toBeNull();
  });

  it('round-trips expectations, weather, dayFacts, voiceXp and roll odds', () => {
    const storage = memoryStorage();
    const base = gameAt('morning');
    const game = {
      ...base,
      expectations: [{ id: 'x1', dialogueId: 'd', spec: { kind: 'depart_by' as const, hour: 9 }, strength: 2, createdDay: 1, dueDay: 2, status: 'open' as const }],
      weather: { day: 1, forecastKn: 10, forecastGustKn: 14, forecastDir: 'NW' as const, barometerHpa: 1012, front: false, frontAddKn: 0, frontDir: 'N' as const, barometerTrendHpa: -1, signalsVisible: true },
      dayFacts: { day: 1, departureHour: 9, arrivalHour: null, arrivalPointKind: null, mooring: null, activities: ['swim' as const], motorHours: 1, sailHours: 2, autopilotHours: 0, maxWindKn: 0, shower: 'normal' as const },
      log: [{ day: 1, clockMin: 540, kind: 'roll' as const, cause: 'c', odds: { value: 0.3, parts: [
        { source: 'base', delta: 0.3 }, { source: 'wind', delta: 0.1, kind: 'add' as const }, { source: 'voice.caution', delta: -0.1, kind: 'mul' as const, factor: 0.75 },
      ] } }],
    };
    writeSave(storage, game, NOW);
    expect(readSave(storage, content)).toEqual({ kind: 'ok', savedAt: NOW.toISOString(), game });
  });

  it.each([
    ['malformed expectation', (g: object) => ({ ...g, expectations: [{ id: 'x' }] })],
    ['malformed weather', (g: object) => ({ ...g, weather: { day: 1 } })],
    ['malformed dayFacts', (g: object) => ({ ...g, dayFacts: 'nope' })],
    ['missing voiceXp', (g: object) => ({ ...g, voiceXp: { order: 1 } })],
    ['malformed odds', (g: object) => ({ ...g, log: [{ day: 1, clockMin: 0, kind: 'roll', cause: 'c', odds: { value: 1, parts: [{ source: 1 }] } }] })],
  ])('rejects a v2 slot with %s as corrupt', (_n, mutate) => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: mutate(gameAt('morning')) }));
    expect(readSave(storage, content).kind).toBe('corrupt');
  });

  it('survives storage that throws (private mode, quota)', () => {
    const broken = { ...memoryStorage(), setItem: () => { throw new Error('QuotaExceeded'); }, getItem: () => { throw new Error('denied'); } } as Storage;
    expect(writeSave(broken, gameAt('morning'), NOW)).toBe(false);
    expect(readSave(broken, content).kind).toBe('none');
    expect(readSave(null, content).kind).toBe('none');
    expect(() => writeLangPref(broken, 'en')).not.toThrow();
  });

  it('remembers the language preference', () => {
    const storage = memoryStorage();
    expect(readLangPref(storage)).toBeNull();
    writeLangPref(storage, 'en');
    expect(readLangPref(storage)).toBe('en');
  });

  it('autosaves once at the start of each day', () => {
    const morning = gameAt('morning');
    const planning = gameAt('planning');
    expect(shouldAutosave(gameAt('briefing'), morning)).toBe(true);
    expect(shouldAutosave(morning, morning)).toBe(false);
    expect(shouldAutosave(morning, { ...morning, day: 2 })).toBe(true);
    expect(shouldAutosave(morning, planning)).toBe(false);
    expect(shouldAutosave(morning, null)).toBe(false);
  });
});
