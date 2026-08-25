/** Application-level failures. The HTTP layer is the only place that knows about status codes. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, code = 'NOT_FOUND') {
    super(message, 404, code);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Kimlik doğrulaması gerekli.', code = 'UNAUTHORIZED') {
    super(message, 401, code);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Bu işlem için yetkiniz yok.', code = 'FORBIDDEN') {
    super(message, 403, code);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT', details?: Record<string, unknown>) {
    super(message, 409, code, details);
  }
}

export class UnprocessableError extends AppError {
  constructor(message: string, code = 'UNPROCESSABLE', details?: Record<string, unknown>) {
    super(message, 422, code, details);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(
    message: string,
    readonly retryAfterSeconds: number,
    code = 'RATE_LIMITED',
  ) {
    super(message, 429, code, { retryAfterSeconds });
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, code = 'BAD_REQUEST', details?: Record<string, unknown>) {
    super(message, 400, code, details);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, code = 'SERVICE_UNAVAILABLE') {
    super(message, 503, code);
  }
}
