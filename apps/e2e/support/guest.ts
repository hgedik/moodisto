import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { venueSlug } from './e2e-env';

/** Turns a literal label into a pattern, so a label containing regex punctuation stays literal. */
const literal = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface Guest {
  readonly context: BrowserContext;
  readonly page: Page;
}

/** A guest is just a fresh browser; the API hands out the anonymous session cookie on contact. */
export const openGuest = async (
  browser: Browser,
  startPath = `/v/${venueSlug}`,
): Promise<Guest> => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(startPath);
  return { context, page };
};

/**
 * Walks the guest from a search box to a sent request.
 *
 * Returns the request page url, which is where a free request lands directly and where a paid one
 * comes back to after checkout.
 */
export const requestSong = async (
  page: Page,
  options: {
    readonly query: string;
    readonly title: string;
    readonly requestType: string;
    readonly tableLabel?: string;
  },
): Promise<void> => {
  await page.goto(`/v/${venueSlug}/search`);
  await page.getByLabel('Şarkı veya sanatçı ara').fill(options.query);

  // Local-first: typing searches the catalogue, and only a guest who does not find their song
  // there asks the provider. Both paths end on the same result button.
  const result = page.getByRole('button', { name: new RegExp(options.title) }).first();
  const askProvider = page.getByRole('button', { name: 'Müzik servisinde ara' });
  await expect(result.or(askProvider).first()).toBeVisible();
  if (!(await result.isVisible())) {
    await askProvider.click();
  }
  await expect(result).toBeVisible();
  await result.click();

  const sheet = page.getByRole('dialog', { name: 'İstek türünü seç' });
  await expect(sheet).toBeVisible();
  if (options.tableLabel !== undefined) {
    await sheet.getByLabel('Masa (isteğe bağlı)').fill(options.tableLabel);
  }
  // Each option's accessible name is its label followed by its hint, and one label is a prefix of
  // another option's hint, so the match is anchored at the start of the name.
  await sheet.getByRole('button', { name: new RegExp(`^${literal(options.requestType)}`) }).click();
};
