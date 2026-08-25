import { expect, test } from '@playwright/test';
import { venueSlug } from '../support/e2e-env';
import { openGuest } from '../support/guest';

test('the console is closed to anyone without a session', async ({ page }) => {
  await page.goto('/venue/queue');

  await expect(page).toHaveURL(/\/venue\/login$/);
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});

test('search spends no quota below the minimum query length', async ({ browser }) => {
  const guest = await openGuest(browser, `/v/${venueSlug}/search`);

  const searches: string[] = [];
  const external: string[] = [];
  guest.page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/music/search')) {
      searches.push(url);
    }
    if (!url.includes('localhost') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await guest.page.getByLabel('Şarkı veya sanatçı ara').fill('du');
  await expect(guest.page.getByText('Aramak için biraz daha yaz…')).toBeVisible();
  expect(searches).toHaveLength(0);

  await guest.page.getByLabel('Şarkı veya sanatçı ara').fill('dudu');
  await expect(guest.page.getByText('Dudu', { exact: true })).toBeVisible();
  expect(searches).toHaveLength(1);

  // The provider key lives on the server: the browser only ever talks to our own API.
  expect(external).toEqual([]);

  await guest.context.close();
});
