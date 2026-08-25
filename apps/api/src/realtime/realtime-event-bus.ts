import { Injectable, Logger } from '@nestjs/common';
import type { EventPublisher, RealtimeMessage } from '../application/ports';

/**
 * Indirection between the persistence layer and the socket transport.
 *
 * Committed transactions publish their events through this bus, and the gateway attaches itself as
 * the transport once it is constructed. Without this seam the graph would be circular — the
 * database would need the gateway to publish, while the gateway needs the database to authorise
 * room joins — and a cycle of that shape cannot be resolved by the container.
 *
 * Events are fire-and-forget by design: realtime delivery is an optimisation on top of the REST
 * endpoints, never the mechanism a client depends on for correctness.
 */
@Injectable()
export class RealtimeEventBus implements EventPublisher {
  private readonly logger = new Logger(RealtimeEventBus.name);
  private transport: EventPublisher | null = null;

  attach(transport: EventPublisher): void {
    this.transport = transport;
  }

  publish(messages: readonly RealtimeMessage[]): void {
    if (messages.length === 0) {
      return;
    }
    if (!this.transport) {
      this.logger.debug(`No realtime transport attached, dropping ${messages.length} event(s).`);
      return;
    }
    this.transport.publish(messages);
  }
}
