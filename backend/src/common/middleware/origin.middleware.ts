import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { Env } from '../../config/env.validation';

const STATE_CHANGING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Defence in depth against CSRF on top of SameSite cookies: a browser always sends Origin on cross-site writes, so a
 * write from an origin we do not know is refused. Requests without Origin (curl, server-to-server) carry no browser
 * cookies and are not a CSRF vector.
 */
@Injectable()
export class OriginMiddleware implements NestMiddleware {
  private readonly allowedOrigins: readonly string[];

  constructor(config: ConfigService<Env, true>) {
    this.allowedOrigins = config.get('FRONTEND_ORIGINS', { infer: true });
  }

  use(request: Request, _response: Response, next: NextFunction): void {
    if (STATE_CHANGING.has(request.method)) {
      const origin = request.headers.origin;
      if (origin && !this.allowedOrigins.includes(origin))
        throw AppException.forbidden('Cross-origin request not allowed');
    }
    next();
  }
}
