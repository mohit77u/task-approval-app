import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppException } from '../../../common/errors/app.exception';
import { Env } from '../../../config/env.validation';
import { OriginGuard } from './origin.guard';

function contextFor(method: string, origin?: string): ExecutionContext {
  const request = { method, headers: origin ? { origin } : {} };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('OriginGuard', () => {
  const config = {
    get: () => ['https://app.example.com'],
  } as unknown as ConfigService<Env, true>;
  const guard = new OriginGuard(config);

  it('lets safe methods through regardless of origin', () => {
    expect(guard.canActivate(contextFor('GET', 'https://evil.example'))).toBe(
      true,
    );
  });

  it('allows state-changing requests from an allowed origin or with no Origin header', () => {
    expect(
      guard.canActivate(contextFor('POST', 'https://app.example.com')),
    ).toBe(true);
    expect(guard.canActivate(contextFor('DELETE'))).toBe(true);
  });

  it('refuses state-changing requests from any other origin', () => {
    expect(() =>
      guard.canActivate(contextFor('POST', 'https://evil.example')),
    ).toThrow(AppException);
    expect(() => guard.canActivate(contextFor('PATCH', 'null'))).toThrow(
      AppException,
    );
  });
});
