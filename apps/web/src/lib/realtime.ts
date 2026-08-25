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
 * Joins one realtime room for as long as the component is mounted.
 *
 * The socket carries the same cookies the HTTP API uses, and the server decides which rooms a
 * connection may join — this hook can only ask. Handlers are read through a ref so that a parent
 * re-render never tears the subscription down and rebuilds it.
 */
export const useRealtime = (
  subscription: RealtimeSubscription | null,
  handlers: RealtimeHandlers,
): { readonly connected: boolean; readonly subscribed: boolean } => {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  const [connected, setConnected] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const key = subscription ? JSON.stringify(subscription) : null;

  useEffect(() => {
    if (!key) {
      return;
    }
    const target = JSON.parse(key) as RealtimeSubscription;
    const socket: Socket = io(apiBaseUrl, {
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });

    const join = (): void => {
      socket.emit(ClientEvent.Subscribe, target, (ack: SubscribeAck) => {
        setSubscribed(ack?.ok === true);
      });
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
      socket.emit(ClientEvent.Unsubscribe, target);
      socket.removeAllListeners();
      socket.disconnect();
      setConnected(false);
      setSubscribed(false);
    };
  }, [key]);

  return { connected, subscribed };
};
