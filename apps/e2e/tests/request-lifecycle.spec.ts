import { expect, test, type Page } from '@playwright/test';
import { openConsole } from '../support/console';
import { catalogue, venueSlug } from '../support/e2e-env';
import { openGuest, requestSong } from '../support/guest';

/** The seed leaves songs waiting in the queue; the run needs the next song played to be its own. */
const emptyQueue = async (page: Page): Promise<void> => {
  await page.goto('/venue/queue');
  await expect(page.getByRole('heading', { name: 'Sıra' })).toBeVisible();

  const remove = page.getByRole('button', { name: 'Sıradan çıkar' });
  const empty = page.getByText('Sıra boş', { exact: true });

  for (let guard = 0; guard < 20; guard += 1) {
    // The queue is fetched after the page renders, so an immediate count would read zero from a
    // list that has not arrived yet and leave the seeded songs in place.
    await expect(remove.first().or(empty)).toBeVisible();
    const remaining = await remove.count();
    if (remaining === 0) {
      break;
    }
    await remove.first().click();
    await expect(remove).toHaveCount(remaining - 1);
  }
  await expect(empty).toBeVisible();
};

test('a free request travels from the guest to the speakers and back', async ({ browser }) => {
  const venue = await openConsole(browser);
  await emptyQueue(venue.page);

  const guest = await openGuest(browser);
  const tableLabel = 'Masa 12';

  await test.step('the guest sends a free request', async () => {
    await requestSong(guest.page, {
      query: catalogue.free.query,
      title: catalogue.free.title,
      requestType: 'Normal istek',
      tableLabel,
    });

    await expect(guest.page).toHaveURL(new RegExp(`/v/${venueSlug}/request/`));
    await expect(guest.page.getByRole('heading', { name: 'İsteğin' })).toBeVisible();
    await expect(guest.page.getByText('Onay bekliyor', { exact: true })).toBeVisible();
    await expect(guest.page.getByText('Ücretsiz', { exact: true })).toBeVisible();
  });

  await test.step('the venue accepts it, which queues it', async () => {
    await venue.page.goto('/venue/requests');
    const card = venue.page.getByRole('listitem').filter({ hasText: tableLabel });
    await expect(card).toBeVisible();
    await expect(card.getByText(catalogue.free.title, { exact: true })).toBeVisible();
    await card.getByRole('button', { name: 'Onayla' }).click();

    // The guest is told without asking: this page never polls.
    await expect(
      guest.page
        .getByText('Sırada', { exact: true })
        .or(guest.page.getByText('Onaylandı', { exact: true })),
    ).toBeVisible();
  });

  await test.step('the player takes the venue and starts the song', async () => {
    await venue.page.goto('/venue/player');
    await venue.page.getByRole('button', { name: "PLAYER'I BAŞLAT" }).click();

    await expect(venue.page.getByTestId('stub-player')).toBeVisible();
    await expect(venue.page.getByText(catalogue.free.title, { exact: true }).first()).toBeVisible();
    await expect(guest.page.getByText('Çalıyor', { exact: true })).toBeVisible();
  });

  await test.step('finishing the song completes the request and empties the queue', async () => {
    await venue.page.getByTestId('stub-ended').click();

    await expect(venue.page.getByText('Sıra boş', { exact: true })).toBeVisible();
    await expect(guest.page.getByText('Çalındı', { exact: true })).toBeVisible();
  });

  await guest.context.close();
  await venue.context.close();
});
