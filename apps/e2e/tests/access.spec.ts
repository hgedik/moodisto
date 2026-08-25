import { expect, test } from '@playwright/test';
import { venueSlug } from '../support/e2e-env';
import { openGuest } from '../support/guest';

test('the console is closed to anyone without a session', async ({ page }) => {
  await page.goto('/venue/queue');

  await expect(page).toHaveURL(/\/venue\/login$/);
  await expect(page.getByRole('button', { name: 'Giriş yap' })).toBeVisible();
});

test('typing searches the local catalogue and never the paid provider', async ({ browser }) => {
  const guest = await openGuest(browser, `/v/${venueSlug}/search`);

  const catalogue: string[] = [];
  const provider: string[] = [];
  const external: string[] = [];
  guest.page.on('request', (request) => {
    const url = request.url();
    if (url.includes('/music/provider-search')) {
      provider.push(url);
    } else if (url.includes('/music/search')) {
      catalogue.push(url);
    }
    if (!url.includes('localhost') && !url.startsWith('data:') && !url.startsWith('blob:')) {
      external.push(url);
    }
  });

  await guest.page.getByLabel('Şarkı veya sanatçı ara').fill('du');
  await expect(guest.page.getByText('Aramak için biraz daha yaz…')).toBeVisible();
  expect(catalogue).toHaveLength(0);

  await guest.page.getByLabel('Şarkı veya sanatçı ara').fill('dudu');
  await expect(guest.page.getByText('Dudu', { exact: true })).toBeVisible();
  expect(catalogue).toHaveLength(1);
  // Typing is free, however much of it there is: the allowance is only ever spent from a tap.
  expect(provider).toEqual([]);

  await guest.page.getByRole('button', { name: 'Müzik servisinde ara' }).click();
  await expect(guest.page.getByRole('button', { name: 'Müzik servisinde ara' })).toBeHidden();
  expect(provider).toHaveLength(1);

  // The provider key lives on the server: the browser only ever talks to our own API.
  expect(external).toEqual([]);

  await guest.context.close();
});
