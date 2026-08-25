import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { CustomerSessionMiddleware } from './auth/customer-session.middleware';
import { CsrfGuard } from './common/csrf.guard';
import { CsrfMiddleware } from './common/csrf.middleware';
import { HealthController } from './common/health.controller';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AppConfigModule } from './config/config.module';
import { InfrastructureModule } from './infrastructure/infrastructure.module';
import { MusicModule } from './music/music.module';
import { PaymentsModule } from './payments/payments.module';
import { PlayerModule } from './player/player.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { EventBusModule } from './realtime/event-bus.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RequestsModule } from './requests/requests.module';
import { VenuesModule } from './venues/venues.module';

/**
 * Composition root. Frameworks and drivers are wired to the application's ports here and nowhere
 * else, which is what keeps the use cases free of Nest, Prisma and HTTP.
 */
@Module({
  imports: [
    AppConfigModule,
    InfrastructureModule,
    EventBusModule,
    PrismaModule,
    RealtimeModule,
    QueueModule,
    MusicModule,
    PaymentsModule,
    AuthModule,
    VenuesModule,
    RequestsModule,
    PlayerModule,
    AdminModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CsrfMiddleware, CustomerSessionMiddleware).forRoutes('*');
  }
}
