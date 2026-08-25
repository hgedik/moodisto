import { Global, Module } from '@nestjs/common';
import { EVENT_PUBLISHER } from '../application/ports';
import { RealtimeEventBus } from './realtime-event-bus';

/**
 * Deliberately dependency-free so that both the persistence layer and the socket gateway can
 * depend on it without depending on each other.
 */
@Global()
@Module({
  providers: [RealtimeEventBus, { provide: EVENT_PUBLISHER, useExisting: RealtimeEventBus }],
  exports: [EVENT_PUBLISHER, RealtimeEventBus],
})
export class EventBusModule {}
