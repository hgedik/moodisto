import { expect, test } from '@playwright/test';
import { openConsole } from '../support/console';
import { catalogue, venueSlug } from '../support/e2e-env';
import { openGuest, requestSong } from '../support/guest';

test('a paid request waits for the money, then for the venue', async ({ browser }) => {
  const guest = await openGuest(browser);
  const tableLabel = 'Masa 27';

  await test.step('checkout stands between the request and the venue', async () => {
    await requestSong(guest.page, {
      query: catalogue.paid.query,
      title: catalogue.paid.title,
      requestType: 'Sıradaki çalsın',
      tableLabel,
    });

    // The browser leaves for the provider's page; a real provider redirects the same way.
    await expect(guest.page).toHaveURL(/\/checkout\/mock/);
    await expect(guest.page.getByRole('heading', { name: 'Test ödemesi' })).toBeVisible();
    await expect(guest.page.getByText(/50,00/)).toBeVisible();

    await guest.page.getByRole('button', { name: 'Ödemeyi onayla' }).click();

    await expect(guest.page).toHaveURL(new RegExp(`/v/${venueSlug}/request/`));
    await expect(guest.page.getByText('Onay bekliyor', { exact: true })).toBeVisible();
    await expect(guest.page.getByText('Ödendi', { exact: true })).toBeVisible();
  });

  const venue = await openConsole(browser);

  await test.step('the venue rejects it with a reason the guest can read', async () => {
    await venue.page.goto('/venue/requests');
    const card = venue.page.getByRole('listitem').filter({ hasText: tableLabel });
    await expect(card).toBeVisible();

    await card.getByRole('button', { name: 'Reddet' }).click();
    await card
      .getByPlaceholder('Red nedeni (isteğe bağlı)')
      .fill('Bu saatte daha sakin çalıyoruz.');
    await card.getByRole('button', { name: 'Reddet' }).click();

    await expect(guest.page.getByText('Reddedildi', { exact: true })).toBeVisible();
    await expect(
      guest.page.getByText('Mekânın notu: Bu saatte daha sakin çalıyoruz.'),
    ).toBeVisible();
  });

  await guest.context.close();
  await venue.context.close();
});
