import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import type TestAgent from 'supertest/lib/agent';
import { PrismaClient } from '@moodisto/database';
import { AppModule } from '../../../src/app.module';

export interface Harness {
  readonly app: INestApplication;
  readonly prisma: PrismaClient;
  /** A fresh cookie jar, i.e. one browser. */
  client(): Promise<Client>;
  reset(): Promise<void>;
  close(): Promise<void>;
}

export interface Client {
  readonly agent: TestAgent;
  readonly csrfToken: string;
  get(path: string): request.Test;
  post(path: string, body?: unknown): request.Test;
  patch(path: string, body?: unknown): request.Test;
  delete(path: string): request.Test;
}

const TRUNCATED_TABLES = [
  'payments',
  'queue_items',
  'song_requests',
  'player_leases',
  'player_states',
  'blocked_music_rules',
  'music_search_cache',
  'provider_quota_usage',
  'customer_sessions',
  'venue_qr_codes',
  'venue_request_pricing',
  'venue_users',
  'tracks',
  'venues',
];

const readCsrfCookie = (setCookie: readonly string[] | string | undefined): string => {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const cookie of cookies) {
    const match = /moodisto_csrf=([^;]+)/.exec(cookie);
    if (match) {
      return decodeURIComponent(match[1] ?? '');
    }
  }
  throw new Error('CSRF çerezi yayınlanmadı.');
};

export const createHarness = async (): Promise<Harness> => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

  const app = moduleRef.createNestApplication({ rawBody: true });
  app.setGlobalPrefix('api', { exclude: ['health'] });
  app.use(cookieParser());
  await app.init();

  const prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

  const client = async (): Promise<Client> => {
    const agent = request.agent(app.getHttpServer());
    const primer = await agent.get('/api/auth/session');
    const csrfToken = readCsrfCookie(primer.headers['set-cookie']);

    const withCsrf = (test: request.Test, body?: unknown): request.Test => {
      const next = test.set('X-CSRF-Token', csrfToken);
      return body === undefined ? next : next.send(body as object);
    };

    return {
      agent,
      csrfToken,
      get: (path) => agent.get(path),
      post: (path, body) => withCsrf(agent.post(path), body ?? {}),
      patch: (path, body) => withCsrf(agent.patch(path), body ?? {}),
      delete: (path) => withCsrf(agent.delete(path)),
    };
  };

  return {
    app,
    prisma,
    client,
    async reset() {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE ${TRUNCATED_TABLES.map((table) => `"${table}"`).join(', ')} RESTART IDENTITY CASCADE`,
      );
    },
    async close() {
      await prisma.$disconnect();
      await app.close();
    },
  };
};
