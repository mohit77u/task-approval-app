import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../errors/app.exception';
import { AuthUser } from '../types/request.types';

/** Injects the verified identity. Only valid on routes behind the JWT middleware. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser => {
    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw AppException.unauthenticated();
    return user;
  },
);
