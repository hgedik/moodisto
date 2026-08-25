import type { ServerEvent, ServerEventPayloads } from '@moodisto/shared-types';

export type RealtimeMessage = {
  [E in ServerEvent]: {
    readonly room: string;
    readonly event: E;
    readonly payload: ServerEventPayloads[E];
  };
}[ServerEvent];

export interface EventPublisher {
  publish(messages: readonly RealtimeMessage[]): void;
}

export const EVENT_PUBLISHER = Symbol('EVENT_PUBLISHER');
