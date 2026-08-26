import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { UnauthorizedError } from '../common/errors';
import type {
  AuthenticatedSystemUser,
  AuthenticatedVenueUser,
  CustomerIdentity,
  MoodistoRequest,
} from './authenticated-request';

export const CurrentVenueUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedVenueUser => {
    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    if (!request.venueUser) {
      throw new UnauthorizedError();
    }
    return request.venueUser;
  },
);

/** The anonymous customer identity, created by CustomerSessionMiddleware on first contact. */
export const CurrentCustomer = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CustomerIdentity => {
    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    if (!request.customer) {
      throw new UnauthorizedError('Misafir oturumu bulunamadı.');
    }
    return request.customer;
  },
);

export const CurrentSystemUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedSystemUser => {
    const request = context.switchToHttp().getRequest<MoodistoRequest>();
    if (!request.systemUser) {
      throw new UnauthorizedError();
    }
    return request.systemUser;
  },
);
