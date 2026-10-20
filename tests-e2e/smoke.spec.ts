import { expect, test, type Page } from '@playwright/test';

const PHONE_MAX = 600;
const MIN_TAP_PX = 44;

async function noHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

async function screenName(page: Page): Promise<string | null> {
  return page.locator('[data-screen]').first().getAttribute('data-screen');
}

const isPhone = (page: Page): boolean => page.viewportSize()!.width < PHONE_MAX;

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** The fixed Logbook toggle must not cover any button of the sticky actions bar, at the top and the bottom. */
async function logbookClearOfActions(page: Page, label: string): Promise<void> {
  const logbook = page.getByRole('button', { name: 'Бортжурнал' });
  if ((await logbook.count()) === 0) return;
  for (const to of ['top', 'bottom'] as const) {
    await page.evaluate((where) => window.scrollTo(0, where === 'top' ? 0 : document.body.scrollHeight), to);
    const toggle = (await logbook.boundingBox())!;
    for (const b of await page.locator('[data-screen] > footer button').all()) {
      const box = (await b.boundingBox())!;
      expect(overlaps(toggle, box), `logbook toggle covers "${await b.textContent()}" on ${label} (${to})`).toBe(false);
    }
  }
  await page.evaluate(() => window.scrollTo(0, 0));
}

/** The sticky actions bar keeps every action fully visible at the top of the page, without scrolling. */
async function actionsInViewport(page: Page, label: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const buttons = await page.locator('[data-screen] > footer button').all();
  expect(buttons.length, `no actions bar on ${label}`).toBeGreaterThan(0);
  for (const b of buttons) await expect(b, `action "${await b.textContent()}" hidden on ${label}`).toBeInViewport({ ratio: 1 });
}

/** Event/outcome art: the caption stays anchored inside its picture (≤800px stacks the layout). */
async function captionInsideScene(page: Page, label: string): Promise<void> {
  const scene = page.locator('[data-screen] figure[data-scene]').first();
  if ((await scene.count()) === 0) return;
  const fig = (await scene.boundingBox())!;
  const cap = (await scene.locator('figcaption').boundingBox())!;
  const inside = cap.x >= fig.x && cap.y >= fig.y && cap.x + cap.width <= fig.x + fig.width && cap.y + cap.height <= fig.y + fig.height;
  expect(inside, `scene caption escapes its picture on ${label}`).toBe(true);
}

/** Real-font check: every chart label stays inside the chart's viewBox. */
async function labelsInsideChart(page: Page): Promise<void> {
  const outside = await page.locator('[data-screen="planning"] figure svg').first().evaluate((svg) => {
    const width = (svg as SVGSVGElement).viewBox.baseVal.width;
    return [...svg.querySelectorAll<SVGTextElement>('g[transform] > text')].flatMap((t) => {
      const ctm = (t.parentNode as SVGGElement).transform.baseVal.consolidate()!.matrix;
      const b = t.getBBox();
      return b.x + ctm.e < 0 || b.x + b.width + ctm.e > width ? [t.textContent] : [];
    });
  });
  expect(outside).toEqual([]);
}

test('from the menu to the day planner without horizontal scroll', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('skipper.lang', 'ru'));
  await page.goto('/');
  const shot = async (name: string) => {
    await noHorizontalScroll(page, name);
    await logbookClearOfActions(page, name);
    await page.screenshot({ path: info.outputPath(`${name}.png`), fullPage: true });
  };
  await shot('menu');
  await page.getByRole('button', { name: 'Новая неделя' }).click();
  await shot('captain');
  for (const voice of ['Морское чутьё', 'Осторожность', 'Порядок', 'Механик', 'Дипломат', 'Экономист']) {
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click({ clickCount: 1 });
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click();
  }
  await page.getByRole('button', { name: 'Дальше' }).click();
  await shot('boat');
  await page.getByRole('button', { name: 'Взять «Мельтеми 40»' }).click();
  await shot('checkin');
  await actionsInViewport(page, 'checkin');
  await page.getByRole('button', { name: 'Закончить приёмку' }).click();
  const topics = page.locator('[data-screen="briefing"] ul li button');
  for (let i = 0; i < 4; i++) await topics.nth(i).click();
  await shot('briefing');
  await page.getByRole('button', { name: 'Начать неделю' }).click();
  await shot('morning');
  await page.getByRole('button', { name: 'Начать день' }).click();
  for (let i = 0; i < 5 && (await screenName(page)) !== 'planning'; i++) {
    const name = (await screenName(page)) ?? 'unknown';
    await shot(`loop-${i}-${name}`);
    await captionInsideScene(page, name);
    if (name === 'event') await page.locator('[data-screen="event"] ol button:not([disabled])').first().click();
    else await page.getByRole('button', { name: 'Дальше' }).click();
  }
  expect(await screenName(page)).toBe('planning');
  await shot('planning');
  await labelsInsideChart(page);
  const map = (await page.locator('[data-screen="planning"] figure svg').first().boundingBox())!;
  const viewport = page.viewportSize()!;
  if (isPhone(page)) {
    expect(map.width).toBeGreaterThan(viewport.width * 0.8);
    const hit = (await page.locator('[data-screen="planning"] circle[data-hit]').first().boundingBox())!;
    expect(hit.width).toBeGreaterThanOrEqual(MIN_TAP_PX);
  } else {
    expect(map.height).toBeLessThanOrEqual(viewport.height);
  }
  await page.locator('[data-screen="planning"] g[role="button"]').first().click();
  await shot('planning-leg');
  if (!isPhone(page)) {
    await expect(page.getByRole('heading', { name: 'Оценка капитана' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'К манёврам' })).toBeInViewport();
  }
  // The richest plan reachable from the base: three legs. The primary action must stay visible without scrolling.
  for (let i = 0; i < 2; i++) await page.locator('[data-screen="planning"] g[role="button"]').first().click();
  await expect(page.locator('[data-screen="planning"] ol li').nth(2)).toBeVisible();
  await expect(page.getByRole('button', { name: 'К манёврам' })).toBeInViewport({ ratio: 1 });
  await logbookClearOfActions(page, 'planning-3-legs');
});

/** Clicks the first maneuver-pool button (an `li` that is not inside an `ol`) of each kind section until every pool is empty. */
async function fillManeuverPools(page: Page): Promise<void> {
  const clickFirstPoolButton = () => page.evaluate(() => {
    for (const section of document.querySelectorAll<HTMLElement>('section[data-kind]')) {
      for (const li of section.querySelectorAll('li')) {
        if (li.closest('ol')) continue;
        const b = li.querySelector('button');
        if (b) { b.click(); return true; }
      }
    }
    return false;
  });
  for (let i = 0; i < 50 && (await clickFirstPoolButton()); i++) await page.waitForTimeout(20);
}

test('the week ends in a debrief with the voices block, without horizontal scroll', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    localStorage.setItem('skipper.lang', 'ru');
    Math.random = () => 0.123;
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Новая неделя' }).click();
  for (const voice of ['Морское чутьё', 'Осторожность', 'Порядок', 'Механик', 'Дипломат', 'Экономист']) {
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click();
    await page.getByRole('button', { name: `Прибавить: ${voice}` }).click();
  }
  await page.getByRole('button', { name: 'Дальше' }).click();
  await page.getByRole('button', { name: 'Взять «Мельтеми 40»' }).click();
  await page.getByRole('button', { name: 'Закончить приёмку' }).click();
  const topics = page.locator('[data-screen="briefing"] ul li button');
  for (let i = 0; i < 4; i++) await topics.nth(i).click();
  await page.getByRole('button', { name: 'Начать неделю' }).click();

  const heading = page.getByRole('heading', { name: 'Голоса недели' });
  for (let step = 0; step < 400 && (await screenName(page)) !== 'debrief'; step++) {
    switch (await screenName(page)) {
      case 'morning': await page.getByRole('button', { name: 'Начать день' }).click(); break;
      case 'planning': {
        const here = await page.getByRole('button', { name: 'Провести день здесь' }).count();
        const target = page.locator('[data-screen="planning"] g[role="button"]').first();
        if (here === 0 || (await target.count()) === 0) await page.getByRole('button', { name: 'Провести день здесь' }).click();
        else {
          await target.click();
          await page.getByRole('button', { name: 'К манёврам' }).click();
        }
        break;
      }
      case 'maneuvers':
        await fillManeuverPools(page);
        await page.getByRole('button', { name: 'Готово' }).click();
        break;
      case 'event': await page.locator('[data-screen="event"] ol button:not([disabled])').first().click(); break;
      case 'evening': await page.getByRole('button', { name: 'Отбой' }).click(); break;
      case 'return': await page.getByRole('button', { name: 'Сдать лодку' }).click(); break;
      default: await page.getByRole('button', { name: 'Дальше' }).click();
    }
  }
  expect(await screenName(page)).toBe('debrief');
  await actionsInViewport(page, 'debrief');
  await expect(heading).toBeVisible();
  await noHorizontalScroll(page, 'debrief');
});
