import type { NextFunction, Request, Response } from 'express';
import { RoleCode } from '../enums/role-code.enum';
import { AppException } from '../errors/app.exception';
import { ErrorCode } from '../errors/error-codes';
import {
  AccessTokenClaims,
  TokenService,
} from '../../security/services/token.service';
import { ACCESS_COOKIE } from '../../security/utils/cookie.options';
import { UsersService } from '../../modules/users/services/users.service';
import { User } from '../../modules/users/entities/user.entity';
import { JwtAuthMiddleware, SessionUserRow } from './jwt-auth.middleware';

/** 2026-10-12T10:00:00Z, in seconds, the way `iat` is encoded. */
const ISSUED_AT = Date.UTC(2026, 9, 12, 10, 0, 0) / 1000;

function claims(overrides: Partial<AccessTokenClaims> = {}): AccessTokenClaims {
  return { id: 5, role: RoleCode.ADMIN, issuedAt: ISSUED_AT, ...overrides };
}

function row(overrides: Partial<SessionUserRow> = {}): SessionUserRow {
  return {
    id: 5,
    passwordChangedAt: null,
    role: { code: RoleCode.ADMIN },
    ...overrides,
  };
}

async function run(
  tokenClaims: AccessTokenClaims | Error,
  user: SessionUserRow | null,
  cookie: string | null = 'signed.jwt.value',
): Promise<{ request: Request; next: jest.Mock; lookups: number[] }> {
  const lookups: number[] = [];
  const tokens = {
    verifyAccessToken: () => {
      if (tokenClaims instanceof Error) throw tokenClaims;
      return tokenClaims;
    },
  } as unknown as TokenService;
  const users = {
    findSessionUser: (id: number) => {
      lookups.push(id);
      return Promise.resolve(user as User | null);
    },
  } as unknown as UsersService;
  const request = {
    cookies: cookie ? { [ACCESS_COOKIE]: cookie } : {},
  } as unknown as Request;
  const next = jest.fn();
  await new JwtAuthMiddleware(tokens, users).use(
    request,
    {} as Response,
    next as NextFunction,
  );
  return { request, next, lookups };
}

async function rejection(promise: Promise<unknown>): Promise<AppException> {
  try {
    await promise;
  } catch (error) {
    return error as AppException;
  }
  throw new Error('expected a rejection');
}

describe('JwtAuthMiddleware', () => {
  it('attaches the user from the database row for a live session', async () => {
    const { request, next, lookups } = await run(claims(), row());
    expect(lookups).toEqual([5]);
    expect(request.user).toEqual({ id: 5, role: RoleCode.ADMIN });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('refuses a request without an access cookie', async () => {
    const pending = run(claims(), row(), null);
    const error = await rejection(pending);
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('passes token errors (e.g. TOKEN_EXPIRED) through unchanged', async () => {
    const error = await rejection(run(AppException.tokenExpired(), row()));
    expect(error.code).toBe(ErrorCode.TOKEN_EXPIRED);
  });

  it('refuses a token whose user was deleted', async () => {
    const error = await rejection(run(claims(), null));
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
    expect(error.getStatus()).toBe(401);
  });

  it('refuses a token issued before the password changed', async () => {
    const changed = new Date((ISSUED_AT + 60) * 1000);
    const error = await rejection(
      run(claims(), row({ passwordChangedAt: changed })),
    );
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('refuses a token from the same second as the change, since iat cannot order them', async () => {
    const changed = new Date(ISSUED_AT * 1000 + 400);
    const error = await rejection(
      run(claims(), row({ passwordChangedAt: changed })),
    );
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('accepts a token issued after the password changed', async () => {
    const changed = new Date((ISSUED_AT - 1) * 1000 + 999);
    const { next } = await run(claims(), row({ passwordChangedAt: changed }));
    expect(next).toHaveBeenCalled();
  });

  it('uses the role from the database, so a demoted admin loses admin rights at once', async () => {
    const { request } = await run(
      claims({ role: RoleCode.ADMIN }),
      row({ role: { code: RoleCode.EMPLOYEE } }),
    );
    expect(request.user).toEqual({ id: 5, role: RoleCode.EMPLOYEE });
  });

  it('refuses a user whose role is not one the code knows', async () => {
    const error = await rejection(
      run(claims(), row({ role: { code: 'ROOT' } })),
    );
    expect(error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });
});
