import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Client, type Harness } from './support/harness';
import { createVenueFixture, VENUE_PASSWORD, type VenueFixture } from './support/fixtures';

const WEBHOOK_SECRET = process.env.PAYMENT_WEBHOOK_SECRET ?? 'test-webhook-secret';
const SIGNATURE_HEADER = 'x-moodisto-signature';

const sign = (rawBody: string): string =>
  createHmac('sha256', WEBHOOK_SECRET).update(rawBody, 'utf8').digest('hex');

describe('paid requests', () => {
  let harness: Harness;
  let venue: VenueFixture;
  let guest: Client;
  let admin: Client;

  beforeAll(async () => {
    harness = await createHarness();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
    venue = await createVenueFixture(harness.prisma);
    guest = await harness.client();
    admin = await harness.client();
    await admin
      .post('/api/auth/venue/login', { email: venue.ownerEmail, password: VENUE_PASSWORD })
      .expect(201);
  });

  const requestPlayNext = () =>
    guest.post(`/api/venues/${venue.slug}/requests`, {
      provider: 'YOUTUBE',
      providerTrackId: 'SCZgGVqVsbY',
      requestType: 'PLAY_NEXT',
    });

  /** Posts a raw string so the signature covers exactly the bytes the server verifies. */
  const postWebhook = (rawBody: string, signature: string) =>
    request(harness.app.getHttpServer())
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .set(SIGNATURE_HEADER, signature)
      .send(rawBody);

  it('holds a paid request out of the venue console until the webhook confirms it', async () => {
    const created = await requestPlayNext().expect(201);

    expect(created.body.request.status).toBe('PENDING_PAYMENT');
    expect(created.body.request.amountMinor).toBe(5000);
    expect(created.body.request.currency).toBe('TRY');
    expect(created.body.payment).not.toBeNull();
    expect(created.body.payment.checkoutUrl).toContain('amountMinor=5000');
    expect(created.body.payment.status).toBe('PENDING');

    // The venue must not see it yet: nothing has been paid.
    expect((await admin.get('/api/venue/requests').expect(200)).body.items).toHaveLength(0);

    const stored = await harness.prisma.payment.findFirstOrThrow({
      where: { songRequestId: created.body.request.id },
    });
    // Money is persisted as an integer amount of the minor unit, never as a float.
    expect(stored.amountMinor).toBe(5000);
    expect(Number.isInteger(stored.amountMinor)).toBe(true);

    const rawBody = JSON.stringify({ providerPaymentId: stored.providerPaymentId, status: 'PAID' });
    await postWebhook(rawBody, sign(rawBody)).expect(201);

    const settled = await harness.prisma.payment.findUniqueOrThrow({ where: { id: stored.id } });
    expect(settled.status).toBe('PAID');
    expect(settled.paidAt).not.toBeNull();

    const pending = await admin.get('/api/venue/requests?status=PENDING').expect(200);
    expect(pending.body.items).toHaveLength(1);
    expect(pending.body.items[0].id).toBe(created.body.request.id);
  });

  it('ignores an unsigned or forged settlement', async () => {
    const created = await requestPlayNext().expect(201);
    const stored = await harness.prisma.payment.findFirstOrThrow({
      where: { songRequestId: created.body.request.id },
    });
    const rawBody = JSON.stringify({ providerPaymentId: stored.providerPaymentId, status: 'PAID' });

    await postWebhook(rawBody, '').expect(401);
    await postWebhook(rawBody, sign(`${rawBody} `)).expect(401);
    await postWebhook(rawBody, sign(JSON.stringify({ providerPaymentId: 'other' }))).expect(401);

    expect(
      (await harness.prisma.payment.findUniqueOrThrow({ where: { id: stored.id } })).status,
    ).toBe('PENDING');
    const untouched = await harness.prisma.songRequest.findUniqueOrThrow({
      where: { id: created.body.request.id },
    });
    expect(untouched.status).toBe('PENDING_PAYMENT');
  });

  it('treats a replayed settlement as a no-op', async () => {
    const created = await requestPlayNext().expect(201);
    const stored = await harness.prisma.payment.findFirstOrThrow({
      where: { songRequestId: created.body.request.id },
    });
    const rawBody = JSON.stringify({ providerPaymentId: stored.providerPaymentId, status: 'PAID' });

    await postWebhook(rawBody, sign(rawBody)).expect(201);
    const firstPaidAt = (
      await harness.prisma.payment.findUniqueOrThrow({ where: { id: stored.id } })
    ).paidAt;

    await postWebhook(rawBody, sign(rawBody)).expect(201);

    const again = await harness.prisma.payment.findUniqueOrThrow({ where: { id: stored.id } });
    expect(again.status).toBe('PAID');
    expect(again.paidAt?.toISOString()).toBe(firstPaidAt?.toISOString());
    expect(
      (
        await harness.prisma.songRequest.findUniqueOrThrow({
          where: { id: created.body.request.id },
        })
      ).status,
    ).toBe('PENDING');
  });

  it('fails the request when the provider reports a failed payment', async () => {
    const created = await requestPlayNext().expect(201);
    const stored = await harness.prisma.payment.findFirstOrThrow({
      where: { songRequestId: created.body.request.id },
    });
    const rawBody = JSON.stringify({
      providerPaymentId: stored.providerPaymentId,
      status: 'FAILED',
    });

    await postWebhook(rawBody, sign(rawBody)).expect(201);

    expect(
      (await harness.prisma.payment.findUniqueOrThrow({ where: { id: stored.id } })).status,
    ).toBe('FAILED');
    expect(
      (
        await harness.prisma.songRequest.findUniqueOrThrow({
          where: { id: created.body.request.id },
        })
      ).status,
    ).toBe('FAILED');
    expect((await admin.get('/api/venue/requests').expect(200)).body.items).toHaveLength(0);
  });

  it('expires a checkout the guest walked away from', async () => {
    const abandoned = await requestPlayNext().expect(201);

    // The row is aged rather than the clock moved: expiry is a property of the request's age, and
    // this keeps the assertion independent of how long the suite takes to run.
    await harness.prisma.songRequest.update({
      where: { id: abandoned.body.request.id },
      data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    // Any later request for the venue sweeps it: the venue lock is already held there.
    await guest
      .post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: 'Lw4unI3tVNQ',
        requestType: 'PLAY_NEXT',
      })
      .expect(201);

    expect(
      (await guest.get(`/api/requests/${abandoned.body.request.id}`).expect(200)).body.status,
    ).toBe('EXPIRED');
  });

  it('leaves a checkout that is still fresh alone', async () => {
    const pending = await requestPlayNext().expect(201);

    await guest
      .post(`/api/venues/${venue.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: 'Lw4unI3tVNQ',
        requestType: 'PLAY_NEXT',
      })
      .expect(201);

    expect(
      (await guest.get(`/api/requests/${pending.body.request.id}`).expect(200)).body.status,
    ).toBe('PENDING_PAYMENT');
  });

  it('skips the checkout entirely when the venue prices a tier at zero', async () => {
    const free = await createVenueFixture(harness.prisma, { playNextPriceMinor: 0 });
    const freeGuest = await harness.client();

    const created = await freeGuest
      .post(`/api/venues/${free.slug}/requests`, {
        provider: 'YOUTUBE',
        providerTrackId: 'Lw4unI3tVNQ',
        requestType: 'PLAY_NEXT',
      })
      .expect(201);

    expect(created.body.request.status).toBe('PENDING');
    expect(created.body.payment).toBeNull();
    expect(await harness.prisma.payment.count()).toBe(0);
  });
});
