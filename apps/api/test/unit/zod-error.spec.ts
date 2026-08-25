import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { musicSearchQuerySchema } from '@moodisto/validation';
import { isZodError } from '../../src/common/zod-error';

describe('isZodError', () => {
  it('recognises a failure raised by a schema from this package', () => {
    const result = (() => {
      try {
        z.object({ q: z.string().min(3) }).parse({ q: 'du' });
        return null;
      } catch (error) {
        return error;
      }
    })();

    expect(isZodError(result)).toBe(true);
  });

  it('recognises a failure raised by a schema from @moodisto/validation', () => {
    // The shared package resolves its own copy of zod, so the thrown error is not an instance of
    // the class this package imports. Recognising it by shape is what keeps the API answering 400.
    let thrown: unknown = null;
    try {
      musicSearchQuerySchema.parse({ q: 'du' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).not.toBeNull();
    expect(isZodError(thrown)).toBe(true);
    expect(isZodError(thrown) && thrown.issues.length).toBeGreaterThan(0);
  });

  it('does not mistake an ordinary error for a validation failure', () => {
    expect(isZodError(new Error('boom'))).toBe(false);
    expect(isZodError({ name: 'ZodError' })).toBe(false);
    expect(isZodError(null)).toBe(false);
    expect(isZodError('ZodError')).toBe(false);
  });
});
