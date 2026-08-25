import { describe, expect, it, vi } from 'vitest';
import { ServerEvent } from '@moodisto/shared-types';
import type { RealtimeMessage } from '../../src/application/ports';
import { RealtimeEventBus } from '../../src/realtime/realtime-event-bus';

const message = (room: string): RealtimeMessage =>
  ({
    room,
    event: ServerEvent.QueueUpdated,
    payload: { venueId: 'v1', current: null, upcoming: [] },
  }) as RealtimeMessage;

describe('RealtimeEventBus', () => {
  it('drops events while no transport is attached instead of throwing', () => {
    const bus = new RealtimeEventBus();
    expect(() => bus.publish([message('venue:v1:admin')])).not.toThrow();
  });

  it('forwards events to the attached transport', () => {
    const bus = new RealtimeEventBus();
    const transport = { publish: vi.fn() };
    bus.attach(transport);

    const messages = [message('venue:v1:admin')];
    bus.publish(messages);

    expect(transport.publish).toHaveBeenCalledWith(messages);
  });

  it('does not call the transport for an empty batch', () => {
    const bus = new RealtimeEventBus();
    const transport = { publish: vi.fn() };
    bus.attach(transport);

    bus.publish([]);

    expect(transport.publish).not.toHaveBeenCalled();
  });
});
