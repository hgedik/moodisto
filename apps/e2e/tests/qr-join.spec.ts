import { expect, test } from '@playwright/test';
import { openConsole } from '../support/console';
import { catalogue, venueSlug } from '../support/e2e-env';
import { openGuest, requestSong } from '../support/guest';

test('scanning a table QR stamps that table on the request', async ({ browser }) => {
  const venue = await openConsole(browser);
  const tableLabel = 'E2E Bahçe';

  await venue.page.goto('/venue/qr');
  await venue.page.getByLabel('Masa adı (isteğe bağlı)').fill(tableLabel);
  await venue.page.getByRole('button', { name: 'QR kod oluştur' }).click();

  const card = venue.page.getByRole('listitem').filter({ hasText: tableLabel });
  await expect(card).toBeVisible();
  const joinUrl = (await card.getByText(/\/join\//).innerText()).trim();
  expect(joinUrl).toContain('/join/');

  const guest = await openGuest(browser, joinUrl);
  await expect(guest.page).toHaveURL(new RegExp(`/v/${venueSlug}$`));

  // The label comes from the scanned code, not from anything the guest can type.
  await requestSong(guest.page, {
    query: catalogue.qr.query,
    title: catalogue.qr.title,
    requestType: 'Normal istek',
    tableLabel: '',
  });

  await expect(guest.page.getByRole('heading', { name: 'İsteğin' })).toBeVisible();
  await expect(guest.page.getByText(tableLabel, { exact: true })).toBeVisible();

  await guest.context.close();
  await venue.context.close();
});
