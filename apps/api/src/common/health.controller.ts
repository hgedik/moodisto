import { Controller, Get, Inject } from '@nestjs/common';
import { CLOCK, type Clock } from '../application/ports';
import { PrismaService } from '../prisma/prisma.service';
import { SkipCsrf } from './skip-csrf.decorator';

export interface HealthResponse {
  readonly status: 'ok' | 'degraded';
  readonly database: 'up' | 'down';
  readonly checkedAt: string;
}

/** Liveness/readiness probe for Docker Compose and any process supervisor in front of the API. */
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  @Get()
  @SkipCsrf()
  async check(): Promise<HealthResponse> {
    let database: 'up' | 'down' = 'up';
    try {
      await this.prisma.client.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      checkedAt: this.clock.now().toISOString(),
    };
  }
}
