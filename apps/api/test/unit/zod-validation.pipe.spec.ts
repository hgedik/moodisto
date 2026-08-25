import { describe, expect, it } from 'vitest';
import { createSongRequestSchema, playerStartSchema } from '@moodisto/validation';
import { ZodValidationPipe, zodBody } from '../../src/common/zod-validation.pipe';

/**
 * Asserts a Zod rejection by shape rather than by class: the schema package and the API resolve
 * their own copies of zod, so `instanceof` is not a reliable check across that boundary.
 */
const expectZodRejection = (run: () => unknown, path: string): void => {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).name).toBe('ZodError');
  expect(JSON.parse((thrown as Error).message)).toEqual(
    expect.arrayContaining([expect.objectContaining({ path: [path] })]),
  );
};

describe('ZodValidationPipe', () => {
  it('returns the parsed value for a valid payload', () => {
    const pipe = new ZodValidationPipe(createSongRequestSchema);

    expect(
      pipe.transform({
        provider: 'YOUTUBE',
        providerTrackId: 'abc123',
        requestType: 'PRIORITY',
        tableLabel: ' Masa 4 ',
      }),
    ).toEqual({
      provider: 'YOUTUBE',
      providerTrackId: 'abc123',
      requestType: 'PRIORITY',
      tableLabel: 'Masa 4',
    });
  });

  it('applies schema defaults to an absent body', () => {
    expect(zodBody(playerStartSchema).transform({ sessionId: 'player-session-1' })).toEqual({
      sessionId: 'player-session-1',
      takeover: false,
    });
  });

  it('rejects an unknown request type', () => {
    const pipe = zodBody(createSongRequestSchema);

    expectZodRejection(
      () =>
        pipe.transform({ provider: 'YOUTUBE', providerTrackId: 'abc', requestType: 'FREE_BEER' }),
      'requestType',
    );
  });

  it('rejects a missing body rather than passing undefined downstream', () => {
    expectZodRejection(() => zodBody(createSongRequestSchema).transform(undefined), 'provider');
  });
});
