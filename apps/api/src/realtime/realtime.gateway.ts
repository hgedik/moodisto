import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  type OnGatewayConnection,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ClientEvent, RealtimeRoom, type RealtimeSubscription } from '@moodisto/shared-types';
import {
  DATABASE,
  type CustomerSessionRecord,
  type Database,
  type EventPublisher,
  type RealtimeMessage,
} from '../application/ports';
import { RealtimeEventBus } from './realtime-event-bus';
import { APP_CONFIG } from '../config/config.module';
import type { AppConfig } from '../config/app-config';
import { COOKIE_NAMES } from '../auth/cookies';
import { VenueTokenService } from '../auth/venue-token.service';

interface SubscribeAck {
  readonly ok: boolean;
  readonly room?: string;
  readonly error?: string;
}

const parseCookies = (header: string | undefined): Record<string, string> => {
  const cookies: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) {
      cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
    }
  }
  return cookies;
};

/**
 * The realtime fan-out.
 *
 * Rooms are the only authorisation boundary on the socket, so every join is checked here against
 * the same cookies the HTTP API uses. Nothing is ever broadcast to a client that could not have
 * read the same data over HTTP.
 */
@Injectable()
@WebSocketGateway({ path: '/socket.io', transports: ['websocket', 'polling'] })
export class RealtimeGateway implements EventPublisher, OnGatewayConnection, OnModuleInit {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  private server?: Server;

  constructor(
    @Inject(DATABASE) private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly tokens: VenueTokenService,
    private readonly bus: RealtimeEventBus,
  ) {}

  /** Registers this gateway as the bus transport; until then committed events are dropped. */
  onModuleInit(): void {
    this.bus.attach(this);
  }

  handleConnection(client: Socket): void {
    const origin = client.handshake.headers.origin;
    if (origin && !this.config.corsOrigins.includes(origin)) {
      this.logger.warn(`Rejected socket connection from origin ${origin}`);
      client.disconnect(true);
    }
  }

  publish(messages: readonly RealtimeMessage[]): void {
    const server = this.server;
    if (!server) {
      return;
    }
    for (const message of messages) {
      server.to(message.room).emit(message.event, message.payload);
    }
  }

  @SubscribeMessage(ClientEvent.Subscribe)
  async subscribe(client: Socket, subscription: RealtimeSubscription): Promise<SubscribeAck> {
    try {
      const room = await this.authorize(client, subscription);
      await client.join(room);
      return { ok: true, room };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'Yetkisiz istek.' };
    }
  }

  @SubscribeMessage(ClientEvent.Unsubscribe)
  async unsubscribe(client: Socket, payload: { room?: string }): Promise<SubscribeAck> {
    if (typeof payload?.room === 'string' && client.rooms.has(payload.room)) {
      await client.leave(payload.room);
    }
    return { ok: true };
  }

  private async authorize(client: Socket, subscription: RealtimeSubscription): Promise<string> {
    const cookies = parseCookies(client.handshake.headers.cookie);

    switch (subscription?.scope) {
      case 'venue-customers': {
        // The guest view is public, exactly like the venue page it mirrors.
        const venue = await this.database.read().venues.findBySlug(subscription.venueSlug);
        if (!venue || !venue.active) {
          throw new Error('Mekân bulunamadı.');
        }
        return RealtimeRoom.customers(venue.id);
      }
      case 'venue-admin':
        return RealtimeRoom.admin(this.requireVenueUser(cookies, subscription.venueId));
      case 'venue-player':
        return RealtimeRoom.player(this.requireVenueUser(cookies, subscription.venueId));
      case 'request': {
        const session = await this.requireCustomerSession(cookies);
        const request = await this.database.read().songRequests.findById(subscription.requestId);
        if (!request || request.customerSessionId !== session.id) {
          throw new Error('Bu istek size ait değil.');
        }
        return RealtimeRoom.request(request.id);
      }
      case 'guest-requests': {
        // The room is named after the session behind the cookie, never after anything the browser
        // sent: a guest can only ever end up in their own room.
        const session = await this.requireCustomerSession(cookies);
        return RealtimeRoom.guest(session.id);
      }
      default:
        throw new Error('Geçersiz abonelik isteği.');
    }
  }

  private async requireCustomerSession(
    cookies: Record<string, string>,
  ): Promise<CustomerSessionRecord> {
    const sessionToken = cookies[COOKIE_NAMES.customerSession];
    if (!sessionToken) {
      throw new Error('Misafir oturumu bulunamadı.');
    }
    const session = await this.database.read().customerSessions.findByToken(sessionToken);
    if (!session) {
      throw new Error('Misafir oturumu bulunamadı.');
    }
    return session;
  }

  private requireVenueUser(cookies: Record<string, string>, venueId: string): string {
    const token = cookies[COOKIE_NAMES.venueSession];
    if (!token) {
      throw new Error('Oturum bulunamadı.');
    }
    const user = this.tokens.verify(token);
    if (user.venueId !== venueId) {
      throw new Error('Bu mekâna erişiminiz yok.');
    }
    return user.venueId;
  }
}
