import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { isRoleCode } from '../enums/role-code.enum';
import { AppException } from '../errors/app.exception';
import { AuthUser } from '../types/request.types';
import {
  AccessTokenClaims,
  TokenService,
} from '../../security/services/token.service';
import { ACCESS_COOKIE } from '../../security/utils/cookie.options';
import { UsersService } from '../../modules/users/services/users.service';

/** The columns of the user row the session check needs. */
export interface SessionUserRow {
  id: number;
  passwordChangedAt: Date | null;
  role: { code: string };
}

/**
 * Decides whether a correctly signed access token still stands for a live session. A signature alone cannot tell, because
 * the token is valid for its full TTL: the user may have been deleted, had their password changed (which must sign them
 * out) or been given another role since it was issued.
 *
 * `iat` has whole-second resolution, so a token issued in the same second as the password change cannot be ordered
 * against it. It is refused: the cost is at most one extra sign-in within a second of the change, whereas accepting it
 * could keep a pre-change session alive.
 */
export function resolveSessionUser(
  claims: AccessTokenClaims,
  user: SessionUserRow | null,
): AuthUser {
  if (!user) throw AppException.unauthenticated();
  if (
    user.passwordChangedAt &&
    claims.issuedAt <= Math.floor(user.passwordChangedAt.getTime() / 1000)
  ) {
    throw AppException.unauthenticated(
      'Session expired. Please sign in again.',
    );
  }
  // The database role wins over the role in the token, so a role change takes effect on the next request.
  if (!isRoleCode(user.role.code)) throw AppException.unauthenticated();
  return { id: user.id, role: user.role.code };
}

/**
 * Authenticates every request it is applied to and attaches `request.user`. Routes that must work without a valid
 * access token (login, refresh, logout, health) are excluded where the middleware is registered (see AppModule), so a
 * new route is protected by default.
 *
 * Costs one primary-key lookup per request. There is deliberately no cache: any cache would reopen a window in which a
 * deleted or signed-out user is still let in.
 */
@Injectable()
export class JwtAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly tokens: TokenService,
    private readonly users: UsersService,
  ) {}

  async use(
    request: Request,
    _response: Response,
    next: NextFunction,
  ): Promise<void> {
    const token: unknown = request.cookies?.[ACCESS_COOKIE];
    if (typeof token !== 'string' || token.length === 0)
      throw AppException.unauthenticated();

    const claims = this.tokens.verifyAccessToken(token);
    const user = await this.users.findSessionUser(claims.id);
    request.user = resolveSessionUser(claims, user);
    next();
  }
}
