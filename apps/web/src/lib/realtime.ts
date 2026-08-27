'use client';

import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import {
  ClientEvent,
  ServerEvent,
  type RealtimeSubscription,
  type ServerEventPayloads,
} from '@moodisto/shared-types';
import { apiBaseUrl } from './api-client';

export type RealtimeHandlers = {
  readonly [E in ServerEvent]?: (payload: ServerEventPayloads[E]) => void;
};

interface SubscribeAck {
  readonly ok: boolean;
  readonly room?: string;
  readonly error?: string;
}

const SERVER_EVENTS = Object.values(ServerEvent);

/**
 * Joins one or more realtime rooms over a single socket for as long as the component is mounted.
 *
 * The socket carries the same cookies the HTTP API uses, and the server decides which rooms a
 * connection may join — this hook can only ask. Handlers are read through a ref so that a parent
 * re-render never tears the subscription down and rebuilds it.
 */
export const useRealtime = (
  subscription: RealtimeSubscription | readonly RealtimeSubscription[] | null,
  handlers: RealtimeHandlers,
): { readonly connected: boolean; readonly subscribed: boolean } => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const targets = subscription
    ? Array.isArray(subscription)
      ? subscription
      : [subscription as RealtimeSubscription]
    : [];
  // The key is what the effect depends on, so an unchanged set of rooms must never rebuild it.
  const key = targets.length > 0 ? JSON.stringify(targets) : null;

  useEffect(() => {
    if (!key) {
      return;
    }
    const rooms = JSON.parse(key) as RealtimeSubscription[];
    const socket: Socket = io(apiBaseUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    const accepted = new Set<string>();
    const join = (): void => {
      accepted.clear();
      for (const room of rooms) {
        socket.emit(ClientEvent.Subscribe, room, (ack: SubscribeAck) => {
          if (ack?.ok === true) {
            accepted.add(JSON.stringify(room));
          }
          // Every room has to be in before the caller is told it is watching everything it asked
          // for; one refused room (a guest with no session yet) leaves the rest working.
          setSubscribed(accepted.size === rooms.length);
        });
      }
    };

    socket.on('connect', () => {
      setConnected(true);
      join();
    });
    socket.on('disconnect', () => {
      setConnected(false);
      setSubscribed(false);
    });

    for (const event of SERVER_EVENTS) {
      socket.on(event, (payload: unknown) => {
        const handler = handlersRef.current[event] as ((value: unknown) => void) | undefined;
        handler?.(payload);
      });
    }

    return () => {
      for (const room of rooms) {
        socket.emit(ClientEvent.Unsubscribe, room);
      }
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
      setSubscribed(false);
    };
  }, [key]);

  return { connected, subscribed };
};
