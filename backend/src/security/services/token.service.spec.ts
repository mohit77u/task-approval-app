import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ErrorCode } from '../../common/errors/error-codes';
import { AppException } from '../../common/errors/app.exception';
import { RoleCode } from '../../common/enums/role-code.enum';
import { Env } from '../../config/env.validation';
import { TokenService } from './token.service';

const SECRET = 'unit-test-secret-unit-test-secret-0123456789';

function build(): { service: TokenService; jwt: JwtService } {
  const values: Record<string, unknown> = {
    JWT_ACCESS_SECRET: SECRET,
    ACCESS_TOKEN_TTL: '30m',
  };
  const config = {
    get: (key: string) => values[key],
  } as unknown as ConfigService<Env, true>;
  const jwt = new JwtService({});
  return { service: new TokenService(jwt, config), jwt };
}

function codeOf(fn: () => unknown): ErrorCode {
  try {
    fn();
  } catch (error) {
    return (error as AppException).code;
  }
  throw new Error('expected the call to throw');
}

describe('TokenService', () => {
  it('round-trips the user identity', async () => {
    const { service } = build();
    const token = await service.signAccessToken({
      id: 7,
      role: RoleCode.ADMIN,
    });
    const before = Math.floor(Date.now() / 1000);
    expect(service.verifyAccessToken(token)).toEqual({
      id: 7,
      role: RoleCode.ADMIN,
      issuedAt: expect.any(Number) as number,
    });
    expect(service.verifyAccessToken(token).issuedAt).toBeGreaterThanOrEqual(
      before - 1,
    );
  });

  it('reports an expired token as TOKEN_EXPIRED so clients know to refresh', async () => {
    const { service, jwt } = build();
    const expired = await jwt.signAsync(
      { sub: 7, role: 'ADMIN' },
      { secret: SECRET, expiresIn: -10 },
    );
    expect(codeOf(() => service.verifyAccessToken(expired))).toBe(
      ErrorCode.TOKEN_EXPIRED,
    );
  });

  it('reports a tampered token as UNAUTHENTICATED', async () => {
    const { service } = build();
    const token = await service.signAccessToken({
      id: 7,
      role: RoleCode.ADMIN,
    });
    expect(codeOf(() => service.verifyAccessToken(`${token}x`))).toBe(
      ErrorCode.UNAUTHENTICATED,
    );
    expect(codeOf(() => service.verifyAccessToken('not-a-jwt'))).toBe(
      ErrorCode.UNAUTHENTICATED,
    );
  });

  it('rejects a validly signed token with an unexpected payload shape', async () => {
    const { service, jwt } = build();
    const odd = await jwt.signAsync(
      { sub: 'abc', role: 'ROOT' },
      { secret: SECRET, expiresIn: 60 },
    );
    expect(codeOf(() => service.verifyAccessToken(odd))).toBe(
      ErrorCode.UNAUTHENTICATED,
    );
  });

  it('rejects a token without an issued-at claim, since revocation checks depend on it', async () => {
    const { service, jwt } = build();
    const noIat = await jwt.signAsync(
      { sub: 7, role: 'ADMIN' },
      { secret: SECRET, expiresIn: 60, noTimestamp: true },
    );
    expect(codeOf(() => service.verifyAccessToken(noIat))).toBe(
      ErrorCode.UNAUTHENTICATED,
    );
  });
});
