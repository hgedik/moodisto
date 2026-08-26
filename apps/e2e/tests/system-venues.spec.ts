import { expect, test } from '@playwright/test';
import { systemUser } from '../support/e2e-env';

/**
 * A run must be able to repeat itself — on a retry, on a database that another run already used —
 * so the venue this spec opens carries a stamp of its own rather than a fixed address.
 */
const stamp = Date.now().toString(36);
const venue = {
  name: `Şişli Kahvesi ${stamp}`,
  slug: `sisli-kahvesi-${stamp}`,
  owner: { name: 'Deniz Yılmaz', email: `deniz-${stamp}@example.com` },
  dj: { name: 'Ece Kaya', email: `ece-${stamp}@example.com` },
};

test('an operator opens a venue and its owner signs in with the generated password', async ({
  browser,
}) => {
  const operatorContext = await browser.newContext();
  const panel = await operatorContext.newPage();

  await panel.goto('/system/login');
  await panel.getByLabel('E-posta').fill(systemUser.email);
  await panel.getByLabel('Parola').fill(systemUser.password);
  await panel.getByRole('button', { name: 'Giriş yap' }).click();
  await expect(panel.getByRole('heading', { name: 'Sistem ayarları' })).toBeVisible();

  await panel.getByRole('link', { name: 'Mekânlar' }).click();
  await expect(panel.getByRole('heading', { name: 'Mekânlar' })).toBeVisible();

  // Typing the name is enough: the address is suggested from it.
  await panel.getByLabel('Mekân adı').fill(venue.name);
  await expect(panel.getByLabel('Adres kısaltması')).toHaveValue(venue.slug);
  await panel.getByLabel('Mekân sahibinin adı').fill(venue.owner.name);
  await panel.getByLabel('Mekân sahibinin e-postası').fill(venue.owner.email);
  await panel.getByLabel('İlk masa etiketi (isteğe bağlı)').fill('Masa 1');
  await panel.getByRole('button', { name: 'Mekânı oluştur' }).click();

  // The password exists in readable form exactly once, here.
  const ownerNotice = panel.getByRole('status').filter({ hasText: venue.owner.email });
  await expect(ownerNotice).toBeVisible();
  const ownerPassword = (await ownerNotice.locator('code').innerText()).trim();
  expect(ownerPassword.length).toBeGreaterThan(8);

  const row = panel.getByRole('listitem').filter({ hasText: venue.name });
  await expect(row).toContainText('Yayında');
  await expect(row).toContainText('1 kullanıcı');
  await row.getByRole('link', { name: 'Yönet' }).click();

  await expect(panel.getByRole('heading', { name: venue.name })).toBeVisible();
  await expect(panel.getByText(`/v/${venue.slug}`)).toBeVisible();

  // A second account for the same venue, this time a DJ. Scoped to the form, because the rows
  // above it carry a role box of their own for every account already there.
  const addUser = panel.locator('form').filter({ hasText: 'Kullanıcı ekle' });
  await addUser.getByLabel('Ad', { exact: true }).fill(venue.dj.name);
  await addUser.getByLabel('E-posta', { exact: true }).fill(venue.dj.email);
  await addUser.getByLabel('Rol').selectOption('DJ');
  await panel.getByRole('button', { name: 'Kullanıcı ekle' }).click();

  await expect(panel.getByRole('status').filter({ hasText: venue.dj.email })).toBeVisible();
  await expect(panel.getByRole('listitem').filter({ hasText: venue.dj.email })).toBeVisible();

  // The owner account works from the guest-facing side of the installation.
  const venueContext = await browser.newContext();
  const venuePage = await venueContext.newPage();

  await venuePage.goto('/venue/login');
  await venuePage.getByLabel('E-posta').fill(venue.owner.email);
  await venuePage.getByLabel('Parola').fill(ownerPassword);
  await venuePage.getByRole('button', { name: 'Giriş yap' }).click();

  await expect(venuePage.getByRole('heading', { name: 'Panel' })).toBeVisible();
  await expect(venuePage.getByText(venue.name)).toBeVisible();

  await venueContext.close();
  await operatorContext.close();
});
