// @vitest-environment jsdom
// The only autosave point is a day's morning, and nothing clears the slot when the week is handed over.
// After the debrief (or a reload on the debrief screen) the menu still offers "Continue" into day 6 morning,
// so a finished week can be replayed from its last morning.
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { playDay } from '../../../src/sim/run';
import { expert } from '../../../src/sim/strategies';
import { memoryStorage, readSave, writeSave } from '../../../src/ui/session/save';
import { content, gameAt } from '../fixtures';
import { renderShell } from '../render';

describe('the save slot after the week is handed over', () => {
  it('a finished week does not leave a "continue" into its last morning', async () => {
    const storage = memoryStorage();
    let morning = gameAt('morning');
    while (morning.day < content.balance.schedule.days) morning = playDay(morning, content, expert);
    writeSave(storage, morning, new Date()); // what the autosave holds on day 6
    let ret = morning;
    while (ret.phase === 'morning') ret = playDay(ret, content, expert);
    const r = renderShell(ret, { storage });
    await r.user.click(screen.getByRole('button', { name: 'Сдать лодку' }));
    expect(r.currentScreen()).toBe('debrief');
    const slot = readSave(storage, content);
    expect(slot.kind === 'ok' && slot.game.phase === 'morning').toBe(false);
  });
});
