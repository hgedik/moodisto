import { PrismaClient, type Prisma } from '@prisma/client';

export interface PrismaClientOptions {
  readonly databaseUrl?: string;
  readonly log?: readonly Prisma.LogLevel[];
}

/**
 * Single place where a Prisma client is constructed.
 *
 * Keeping construction here means the API, the seed script and the integration harness all share
 * one connection policy, and the datasource URL can be overridden per process (the test suite
 * points it at `moodisto_test`).
 */
export function createPrismaClient(options: PrismaClientOptions = {}): PrismaClient {
  return new PrismaClient({
    log: [...(options.log ?? [])],
    ...(options.databaseUrl === undefined
      ? {}
      : { datasources: { db: { url: options.databaseUrl } } }),
  });
}
