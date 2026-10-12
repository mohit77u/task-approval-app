import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { isRoleCode, RoleCode } from '../../common/enums/role-code.enum';
import { AppException } from '../../common/errors/app.exception';
import { AuthUser } from '../../common/types/request.types';
import { Env } from '../../config/env.validation';

interface AccessPayload {
  sub: unknown;
  role: unknown;
}

@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  signAccessToken(user: AuthUser): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role satisfies RoleCode },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        // The env value is validated as a duration string; the library's type is a narrower template literal.
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- the cast is required, `string` is not assignable
        expiresIn: this.config.get('ACCESS_TOKEN_TTL', {
          infer: true,
        }) as JwtSignOptions['expiresIn'],
      },
    );
  }

  verifyAccessToken(token: string): AuthUser {
    let payload: AccessPayload;
    try {
      payload = this.jwt.verify(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch (error) {
      // Distinguishing "expired" lets the client refresh silently instead of sending the user to the login page.
      throw (error as Error).name === 'TokenExpiredError'
        ? AppException.tokenExpired()
        : AppException.unauthenticated();
    }
    if (
      typeof payload.sub !== 'number' ||
      typeof payload.role !== 'string' ||
      !isRoleCode(payload.role)
    ) {
      throw AppException.unauthenticated();
    }
    return { id: payload.sub, role: payload.role };
  }
}
