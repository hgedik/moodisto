import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType, ZodTypeDef } from 'zod';

/** A schema whose input is whatever arrived on the wire, and whose output is the parsed value. */
type BodySchema<T> = ZodType<T, ZodTypeDef, unknown>;

/**
 * Parses a request payload with a schema from `@moodisto/validation`, so the browser and the API
 * agree on exactly one definition of "valid". Failures surface through HttpExceptionFilter.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: BodySchema<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value ?? {});
  }
}

export const zodBody = <T>(schema: BodySchema<T>): ZodValidationPipe<T> =>
  new ZodValidationPipe(schema);
