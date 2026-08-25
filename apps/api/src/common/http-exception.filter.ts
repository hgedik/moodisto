import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  DomainError,
  InvalidStateTransitionError,
  QueueReorderMismatchError,
  RequestTypeDisabledError,
} from '@moodisto/queue-engine';
import {
  MusicProviderNotConfiguredError,
  MusicProviderQuotaExceededError,
  MusicProviderUnavailableError,
} from '@moodisto/music-provider';
import type { ApiErrorBody } from '@moodisto/shared-types';
import type { Request, Response } from 'express';
import { AppError } from './errors';
import { isZodError } from './zod-error';

interface NormalisedError {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
  readonly retryAfterSeconds?: number;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const normalised = this.normalise(exception);

    if (normalised.status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.url} -> ${normalised.status} ${normalised.code}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    if (normalised.retryAfterSeconds !== undefined) {
      response.setHeader('Retry-After', String(normalised.retryAfterSeconds));
    }

    const body: ApiErrorBody & { details?: unknown } = {
      statusCode: normalised.status,
      error: HttpStatus[normalised.status] ?? 'ERROR',
      message: normalised.message,
      code: normalised.code,
      ...(normalised.details === undefined ? {} : { details: normalised.details }),
    };
    response.status(normalised.status).json(body);
  }

  private normalise(exception: unknown): NormalisedError {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: exception.message,
        details: exception.details,
        retryAfterSeconds:
          typeof exception.details?.['retryAfterSeconds'] === 'number'
            ? (exception.details['retryAfterSeconds'] as number)
            : undefined,
      };
    }

    if (isZodError(exception)) {
      return {
        status: HttpStatus.BAD_REQUEST,
        code: 'VALIDATION_FAILED',
        message: 'Gönderilen veri geçersiz.',
        details: exception.issues.map((issue) => ({
          path: issue.path.map(String).join('.'),
          message: issue.message,
        })),
      };
    }

    if (exception instanceof RequestTypeDisabledError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
      };
    }
    if (exception instanceof InvalidStateTransitionError) {
      return { status: HttpStatus.CONFLICT, code: exception.code, message: exception.message };
    }
    if (exception instanceof QueueReorderMismatchError) {
      return { status: HttpStatus.CONFLICT, code: exception.code, message: exception.message };
    }
    if (exception instanceof DomainError) {
      return {
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        code: exception.code,
        message: exception.message,
      };
    }

    if (exception instanceof MusicProviderNotConfiguredError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'MUSIC_PROVIDER_NOT_CONFIGURED',
        message: 'Müzik sağlayıcısı yapılandırılmamış.',
      };
    }
    if (exception instanceof MusicProviderQuotaExceededError) {
      return {
        status: HttpStatus.SERVICE_UNAVAILABLE,
        code: 'MUSIC_PROVIDER_QUOTA_EXCEEDED',
        message: 'Müzik arama kotası doldu, lütfen daha sonra tekrar deneyin.',
      };
    }
    if (exception instanceof MusicProviderUnavailableError) {
      return {
        status: HttpStatus.BAD_GATEWAY,
        code: 'MUSIC_PROVIDER_UNAVAILABLE',
        message: 'Müzik sağlayıcısına şu anda ulaşılamıyor.',
      };
    }

    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return {
        status: exception.getStatus(),
        code: 'HTTP_ERROR',
        message: Array.isArray(message) ? message.join(', ') : message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'INTERNAL_ERROR',
      message: 'Beklenmeyen bir hata oluştu.',
    };
  }
}
