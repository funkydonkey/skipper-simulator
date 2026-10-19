import { screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TRAINABLE_VOICES, type Lang } from '../../src/engine';
import { COMMON } from '../../src/ui/i18n/common';
import { VOICE_NAMES } from '../../src/ui/i18n/glossary';
import { fmt } from '../../src/ui/i18n/t';
import { BOAT } from '../../src/ui/screens/boat/strings';
import { BRIEFING } from '../../src/ui/screens/briefing/strings';
import { CAPTAIN } from '../../src/ui/screens/captain/strings';
import { CHECKIN } from '../../src/ui/screens/checkin/strings';
import { EVENING } from '../../src/ui/screens/evening/strings';
import { MANEUVERS } from '../../src/ui/screens/maneuvers/strings';
import { MENU } from '../../src/ui/screens/menu/strings';
import { MORNING } from '../../src/ui/screens/morning/strings';
import { PLANNING } from '../../src/ui/screens/planning/strings';
import { RETURN } from '../../src/ui/screens/return/strings';
import { content } from './fixtures';
import { renderShell } from './render';

const MAX_STEPS = 400;
const name = (id: string, lang: Lang) => content.map.find((p) => p.id === id)!.name[lang];
const button = (label: string) => screen.getByRole('button', { name: label });

function assertHealthy(lang: Lang): void {
  const text = document.body.textContent ?? '';
  expect(screen.queryByRole('alert')).toBeNull();
  expect(text).not.toMatch(/\{\w+\}|undefined|NaN/);
  if (lang === 'en') expect(text).not.toMatch(/[А-Яа-яЁё]/);
}

async function playWeek(lang: Lang): Promise<ReturnType<typeof renderShell>> {
  vi.spyOn(Math, 'random').mockReturnValue(0.123);
  const r = renderShell(null, { lang });
  const { user } = r;
  assertHealthy(lang);
  await user.click(button(MENU.newWeek[lang]));
  assertHealthy(lang);
  for (const v of TRAINABLE_VOICES) {
    const raise = button(fmt(CAPTAIN.raise[lang], { voice: VOICE_NAMES[v][lang] }));
    await user.click(raise);
    await user.click(raise);
  }
  assertHealthy(lang);
  await user.click(button(COMMON.next[lang]));
  assertHealthy(lang);
  await user.click(button(fmt(BOAT.take[lang], { name: content.boats.find((b) => b.id === 'meltemi_40')!.name[lang] })));
  assertHealthy(lang);
  await user.click(button(CHECKIN.finish[lang]));
  assertHealthy(lang);
  for (const topic of content.briefing.slice(0, content.balance.briefing.slots)) {
    await user.click(screen.getByRole('button', { name: new RegExp(topic.title[lang]) }));
  }
  assertHealthy(lang);
  await user.click(button(BRIEFING.start[lang]));

  for (let step = 0; step < MAX_STEPS && r.currentScreen() !== 'debrief'; step++) {
    assertHealthy(lang);
    const game = r.session().game!;
    switch (r.currentScreen()) {
      case 'morning': await user.click(button(MORNING.start[lang])); break;
      case 'planning': {
        const target = game.locationId === 'base_marina' ? 'cala_azzurra' : 'base_marina';
        const point = screen.queryByRole('button', { name: name(target, lang) });
        if (point) {
          await user.click(point);
          await user.click(button(PLANNING.toManeuvers[lang]));
        } else {
          await user.click(button(PLANNING.stay[lang]));
        }
        break;
      }
      case 'maneuvers': {
        const done = button(MANEUVERS.done[lang]);
        for (const section of document.querySelectorAll<HTMLElement>('section[data-kind]')) {
          const pool = () => within(section).queryAllByRole('listitem').flatMap((li) => li.closest('ol') ? [] : within(li).queryAllByRole('button'));
          for (let b = pool()[0]; b; b = pool()[0]) await user.click(b);
        }
        expect(done).toBeEnabled();
        await user.click(done);
        break;
      }
      case 'passage':
      case 'outcome': await user.click(button(COMMON.next[lang])); break;
      case 'event': {
        const option = screen.getAllByRole('button').find((b) => !b.hasAttribute('disabled') && b.closest('ol'));
        expect(option, 'an event must offer at least one available option').toBeDefined();
        await user.click(option!);
        break;
      }
      case 'evening': await user.click(button(EVENING.sleep[lang])); break;
      case 'return': await user.click(button(RETURN.handover[lang])); break;
      default: throw new Error(`Dead end on screen ${r.currentScreen()}`);
    }
  }
  return r;
}

describe('a whole week in the browser UI', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each(['ru', 'en'] as const)('plays from the menu to the debrief without dead ends (%s)', async (lang) => {
    const r = await playWeek(lang);
    expect(r.currentScreen()).toBe('debrief');
    expect(screen.getAllByLabelText(/^(Оценка|Grade):/)).toHaveLength(4);
    expect(r.session().game!.phase).toBe('debrief');
    assertHealthy(lang);
  }, 120_000);
});
