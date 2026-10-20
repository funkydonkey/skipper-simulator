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

  it('reports none, corrupt JSON, wrong version and dangling references', () => {
    const storage = memoryStorage();
    expect(readSave(storage, content).kind).toBe('none');
    storage.setItem(SAVE_KEY, '{not json');
    expect(readSave(storage, content).kind).toBe('corrupt');
    const game = gameAt('morning');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, version: 1 } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    storage.setItem(SAVE_KEY, JSON.stringify({ savedAt: 'x', game: { ...game, boatId: 'ghost_boat' } }));
    expect(readSave(storage, content).kind).toBe('corrupt');
    clearSave(storage);
    expect(readSave(storage, content).kind).toBe('none');
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
