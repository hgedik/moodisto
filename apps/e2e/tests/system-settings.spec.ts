import { expect, test } from '@playwright/test';
import { systemUser } from '../support/e2e-env';
import { openConsole } from '../support/console';

/** The row a setting occupies in the panel, found by the key printed under its label. */
const settingRow = (page: import('@playwright/test').Page, key: string) =>
  page.getByRole('listitem').filter({ hasText: key });

test('an operator changes a setting and it is served from the database afterwards', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('/system/login');
  await page.getByLabel('E-posta').fill(systemUser.email);
  await page.getByLabel('Parola').fill(systemUser.password);
  await page.getByRole('button', { name: 'Giriş yap' }).click();

  await expect(page.getByRole('heading', { name: 'Sistem ayarları' })).toBeVisible();

  const region = settingRow(page, 'YOUTUBE_REGION_CODE');
  // Nothing has been written yet, so the value still comes from the catalogue default.
  await expect(region.getByText('varsayılan')).toBeVisible();

  // The key itself is never sent to the browser: the box is empty and only hints at what is stored.
  const apiKey = settingRow(page, 'YOUTUBE_API_KEY').getByLabel('YouTube API anahtarı');
  await expect(apiKey).toHaveAttribute('type', 'password');
  await expect(apiKey).toHaveValue('');

  await region.getByLabel('Bölge kodu').fill('DE');
  await page.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Ayarlar kaydedildi ve hemen geçerli oldu.')).toBeVisible();

  // A reload proves the value survived the request rather than only the form state.
  await page.reload();
  await expect(settingRow(page, 'YOUTUBE_REGION_CODE').getByLabel('Bölge kodu')).toHaveValue('DE');
  await expect(settingRow(page, 'YOUTUBE_REGION_CODE').getByText('veritabanı')).toBeVisible();

  // Put the installation back the way the other specs expect to find it.
  await settingRow(page, 'YOUTUBE_REGION_CODE').getByRole('button', { name: 'Temizle' }).click();
  await expect(settingRow(page, 'YOUTUBE_REGION_CODE').getByText('varsayılan')).toBeVisible();

  await context.close();
});

test('a venue session does not open the system console', async ({ browser }) => {
  const { context, page } = await openConsole(browser);

  await page.goto('/system/settings');

  await expect(page).toHaveURL(/\/system\/login$/);
  await expect(page.getByRole('heading', { name: 'Sistem girişi' })).toBeVisible();

  await context.close();
});
