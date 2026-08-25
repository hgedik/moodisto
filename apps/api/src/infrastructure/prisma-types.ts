import type { Prisma } from '@moodisto/database';

/**
 * Every repository accepts this client so the exact same code runs inside and outside a
 * transaction; only `Database` decides which one is handed over.
 */
export type PrismaTx = Prisma.TransactionClient;
