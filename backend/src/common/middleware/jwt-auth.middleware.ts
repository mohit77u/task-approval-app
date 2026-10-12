import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import '../types/request.types';
import { TokenService } from '../../security/services/token.service';
import { ACCESS_COOKIE } from '../../security/utils/cookie.options';

/**
 * Authenticates every request it is applied to and attaches `request.user`. Routes that must work without a valid
 * access token (login, refresh, logout, health) are excluded where the middleware is registered (see AppModule), so a
 * new route is protected by default.
 */
@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(private readonly tokens: TokenService) {}

  use(request: Request, _response: Response, next: NextFunction): void {
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0)
      throw AppException.unauthenticated();

    request.user = this.tokens.verifyAccessToken(token);
    next();
  }
}
