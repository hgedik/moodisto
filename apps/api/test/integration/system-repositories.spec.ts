import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DATABASE, type Database } from '../../src/application/ports';
import { createHarness, type Harness } from './support/harness';

/**
 * The system user and the settings it edits live outside every venue: nothing about them is
 * scoped to a venue, and no venue session may reach them. These tests pin the persistence
 * contract the settings service is built on.
 */
describe('system user and settings persistence', () => {
  let harness: Harness;
  let database: Database;

  const createSystemUser = async (): Promise<string> => {
    const row = await harness.prisma.systemUser.create({
      data: { email: 'system@example.com', name: 'Sistem', passwordHash: 'hash' },
    });
    return row.id;
  };

  beforeAll(async () => {
    harness = await createHarness();
    database = harness.app.get<Database>(DATABASE);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  it('finds an active system user by email and by id', async () => {
    const id = await createSystemUser();

    const byEmail = await database.read().systemUsers.findByEmail('system@example.com');
    expect(byEmail).toMatchObject({ id, email: 'system@example.com', active: true });

    const byId = await database.read().systemUsers.findById(id);
    expect(byId?.email).toBe('system@example.com');
    expect(await database.read().systemUsers.findByEmail('nobody@example.com')).toBeNull();
  });

  it('stamps the last login without touching anything else', async () => {
    const id = await createSystemUser();
    const at = new Date('2026-08-27T10:00:00.000Z');

    await database.transaction(async (uow) => uow.systemUsers.markLoggedIn(id, at));

    const row = await harness.prisma.systemUser.findUniqueOrThrow({ where: { id } });
    expect(row.lastLoginAt?.toISOString()).toBe(at.toISOString());
    expect(row.email).toBe('system@example.com');
  });

  it('writes settings once and overwrites them on the next save', async () => {
    const actorId = await createSystemUser();

    await database.transaction(async (uow) =>
      uow.systemSettings.save(
        [
          { key: 'YOUTUBE_REGION_CODE', valueText: 'TR', valueCipher: null, secret: false },
          { key: 'YOUTUBE_API_KEY', valueText: null, valueCipher: 'cipher-1', secret: true },
        ],
        actorId,
      ),
    );

    await database.transaction(async (uow) =>
      uow.systemSettings.save(
        [{ key: 'YOUTUBE_REGION_CODE', valueText: 'DE', valueCipher: null, secret: false }],
        actorId,
      ),
    );

    const rows = await database.read().systemSettings.findAll();
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.key === 'YOUTUBE_REGION_CODE')).toMatchObject({
      valueText: 'DE',
      secret: false,
      updatedById: actorId,
    });
    expect(rows.find((row) => row.key === 'YOUTUBE_API_KEY')).toMatchObject({
      valueText: null,
      valueCipher: 'cipher-1',
      secret: true,
    });
  });

  it('removes a setting so the environment fallback takes over again', async () => {
    const actorId = await createSystemUser();
    await database.transaction(async (uow) =>
      uow.systemSettings.save(
        [{ key: 'YOUTUBE_REGION_CODE', valueText: 'TR', valueCipher: null, secret: false }],
        actorId,
      ),
    );

    await database.transaction(async (uow) => uow.systemSettings.remove(['YOUTUBE_REGION_CODE']));

    expect(await database.read().systemSettings.findAll()).toHaveLength(0);
  });

  it('keeps the settings when the system user who wrote them is deleted', async () => {
    const actorId = await createSystemUser();
    await database.transaction(async (uow) =>
      uow.systemSettings.save(
        [{ key: 'YOUTUBE_REGION_CODE', valueText: 'TR', valueCipher: null, secret: false }],
        actorId,
      ),
    );

    await harness.prisma.systemUser.delete({ where: { id: actorId } });

    const rows = await database.read().systemSettings.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.updatedById).toBeNull();
  });
});
