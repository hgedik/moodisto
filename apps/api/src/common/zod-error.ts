export interface ZodIssueLike {
  readonly path: readonly (string | number | symbol)[];
  readonly message: string;
}

export interface ZodErrorLike {
  readonly issues: readonly ZodIssueLike[];
}

/**
 * `instanceof ZodError` is unreliable here: `@moodisto/validation` ships its own zod resolution, so
 * a schema defined there throws an error from a different class object than the one this package
 * imports. The shape is stable across copies, the identity is not.
 */
export const isZodError = (error: unknown): error is ZodErrorLike => {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { name?: unknown; issues?: unknown };
  return candidate.name === 'ZodError' && Array.isArray(candidate.issues);
};
