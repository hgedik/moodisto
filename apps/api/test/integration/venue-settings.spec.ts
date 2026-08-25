import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, VENUE_PASSWORD, type VenueFixture } from './support/fixtures';

describe('venue settings', () => {
  let harness: Harness;
  let venue: VenueFixture;

  const loginAsOwner = async (): Promise<Client> => {
    const client = await harness.client();
    await client
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);
    return client;
  };

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    venue = await createVenueFixture(harness.prisma);
  });

  /**
   * The console renders the settings form from this response and sends the whole object back. A
   * field the response omits would be blanked on every save, so the read has to be complete.
   */
  it('returns every editable field so a save cannot blank one', async () => {
    const owner = await loginAsOwner();

    const saved = await owner.patch('/api/venue/settings', {
      name: 'Moodisto Test Sahne',
      description: 'Canlı müzik ve kahve.',
      address: 'Kadıköy, İstanbul',
      timezone: 'Europe/Istanbul',
      latitude: 40.99,
      longitude: 29.03,
      logoUrl: null,
      active: true,
    });
    expect(saved.status).toBe(200);
    expect(saved.body).toMatchObject({
      name: 'Moodisto Test Sahne',
      description: 'Canlı müzik ve kahve.',
      address: 'Kadıköy, İstanbul',
      latitude: 40.99,
      longitude: 29.03,
    });

    const reread = await owner.get('/api/venue/settings');
    expect(reread.status).toBe(200);
    expect(reread.body.description).toBe('Canlı müzik ve kahve.');
  });
});
