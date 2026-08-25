import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { owner } from './e2e-env';

export interface Console {
  readonly context: BrowserContext;
  readonly page: Page;
}

/**
 * Opens the venue console as the seeded owner.
 *
 * The session lives in an HttpOnly cookie the browser context holds; nothing is read from or
 * written to storage here, which is exactly what the application guarantees.
 */
export const openConsole = async (browser: Browser): Promise<Console> => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/venue/login');
  await page.getByLabel('E-posta').fill(owner.email);
  await page.getByLabel('Parola').fill(owner.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  await expect(page.getByRole('heading', { name: 'Panel' })).toBeVisible();
  return { context, page };
};
