import { expect, test, type Page } from '@playwright/test';

async function noHorizontalScroll(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, `horizontal overflow on ${label}`).toBeLessThanOrEqual(0);
}

async function screenName(page: Page): Promise<string | null> {
  return page.locator('[data-screen]').first().getAttribute('data-screen');
}

test('from the menu to the day planner without horizontal scroll', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('skipper.lang', 'ru'));
  await page.goto('/');
  const shot = async (name: string) => {
    await noHorizontalScroll(page, name);
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
  await page.getByRole('button', { name: 'Закончить приёмку' }).click();
  const topics = page.locator('[data-screen="briefing"] ul li button');
  for (let i = 0; i < 4; i++) await topics.nth(i).click();
  await shot('briefing');
  await page.getByRole('button', { name: 'Начать неделю' }).click();
  await shot('morning');
  await page.getByRole('button', { name: 'Начать день' }).click();
  for (let i = 0; i < 5 && (await screenName(page)) !== 'planning'; i++) {
    if ((await screenName(page)) === 'event') await page.locator('[data-screen="event"] ol button:not([disabled])').first().click();
    else await page.getByRole('button', { name: 'Дальше' }).click();
  }
  expect(await screenName(page)).toBe('planning');
  await shot('planning');
  const map = await page.locator('[data-screen="planning"] figure svg').first().boundingBox();
  const frame = await page.locator('[data-screen="planning"] figure').first().boundingBox();
  expect(map!.width).toBeGreaterThanOrEqual(frame!.width * 0.95);
  if (page.viewportSize()!.width < 600) expect(map!.width).toBeGreaterThan(page.viewportSize()!.width * 0.8);
});
