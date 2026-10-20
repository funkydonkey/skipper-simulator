import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage, SAVE_KEY, writeSave } from '../../../src/ui/session/save';
import { gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('MenuScreen', () => {
  afterEach(() => vi.restoreAllMocks());

  it('starts a new week with a random seed', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const r = renderShell(null);
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await r.user.click(screen.getByRole('button', { name: 'Новая неделя' }));
    expect(r.currentScreen()).toBe('captain');
    expect(r.session().game?.seed).toBe(2 ** 30);
  });

  it('starts a week with a chosen seed', async () => {
    const r = renderShell(null);
    await r.user.click(screen.getByText('Настройки'));
    await r.user.type(screen.getByLabelText('Seed недели'), '4242');
    await r.user.click(screen.getByRole('button', { name: 'Новая неделя' }));
    expect(r.session().game?.seed).toBe(4242);
  });

  it('continues a saved week', async () => {
    const storage = memoryStorage();
    writeSave(storage, gameAt('morning'), new Date('2026-10-19T09:30:00'));
    const r = renderShell(null, { storage });
    expect(screen.getByText(/День 1/)).toBeInTheDocument();
    await r.user.click(screen.getByRole('button', { name: 'Продолжить' }));
    expect(r.currentScreen()).toBe('morning');
  });

  it('reports a corrupt save and lets the player delete it', async () => {
    const storage = memoryStorage();
    storage.setItem(SAVE_KEY, '{oops');
    const r = renderShell(null, { storage });
    expect(screen.getByText('Сохранение повреждено')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await r.user.click(screen.getByRole('button', { name: 'Удалить сохранение' }));
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(screen.queryByText('Сохранение повреждено')).toBeNull();
  });

  it('shows the legacy-save notice once and still starts a new week', async () => {
    const storage = memoryStorage();
    storage.setItem('skipper.save.v1', '{}');
    const r = renderShell(null, { storage });
    expect(screen.getByText(/Сохранение от старой версии несовместимо/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Продолжить' })).toBeDisabled();
    await r.user.click(screen.getByRole('button', { name: 'Новая неделя' }));
    expect(r.currentScreen()).toBe('captain');
    r.unmount();
    renderShell(null, { storage });
    expect(screen.queryByText(/Сохранение от старой версии несовместимо/)).toBeNull();
  });

  it('switches the language of the whole menu', async () => {
    const r = renderShell(null);
    await r.user.click(screen.getByRole('button', { name: 'EN' }));
    expect(screen.getByRole('button', { name: 'New week' })).toBeInTheDocument();
    expect(r.session().lang).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });
});
