import { Inject, Injectable } from '@nestjs/common';
import type { Database, EventPublisher, UnitOfWork } from '../application/ports';
import { EVENT_PUBLISHER } from '../application/ports';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaUnitOfWork } from './prisma-unit-of-work';

/**
 * Realtime messages buffered during a transaction are dispatched only after it commits, so no
 * client can ever observe an event for work that was rolled back.
 */
@Injectable()
export class PrismaDatabase implements Database {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(EVENT_PUBLISHER) private readonly events: EventPublisher,
  ) {}

  read(): UnitOfWork {
    return new PrismaUnitOfWork(this.prisma.client);
  }

  async transaction<T>(work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    let pending: PrismaUnitOfWork | null = null;

    const result = await this.prisma.client.$transaction(
      async (tx) => {
        const uow = new PrismaUnitOfWork(tx);
        pending = uow;
        return work(uow);
      },
      { timeout: 15_000, maxWait: 10_000 },
    );

    if (pending !== null) {
      this.events.publish((pending as PrismaUnitOfWork).drain());
    }
    return result;
  }
}
