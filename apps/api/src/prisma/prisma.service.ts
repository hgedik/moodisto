import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@moodisto/database';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';

/** Owns the single PrismaClient instance and its connection lifecycle. */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  readonly client: PrismaClient;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.client = createPrismaClient({
      databaseUrl: config.databaseUrl,
      log: config.isProduction ? ['warn', 'error'] : ['warn', 'error'],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
    this.logger.log('Veritabanı bağlantısı kuruldu.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
