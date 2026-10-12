import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { AppException } from '../errors/app.exception';
import { Env } from '../../config/env.validation';
import { OriginMiddleware } from './origin.middleware';

function run(method: string, origin?: string): jest.Mock {
  const config = {
    get: () => ['https://app.example.com'],
  } as unknown as ConfigService<Env, true>;
  const next = jest.fn();
  const request = {
    method,
    headers: origin ? { origin } : {},
  } as unknown as Request;
  new OriginMiddleware(config).use(request, {} as Response, next);
  return next;
}

describe('OriginMiddleware', () => {
  it('lets safe methods through regardless of origin', () => {
    expect(run('GET', 'https://evil.example')).toHaveBeenCalled();
  });

  it('allows state-changing requests from an allowed origin or with no Origin header', () => {
    expect(run('POST', 'https://app.example.com')).toHaveBeenCalled();
    expect(run('DELETE')).toHaveBeenCalled();
  });

  it('refuses state-changing requests from an unknown origin', () => {
    expect(() => run('POST', 'https://evil.example')).toThrow(AppException);
    expect(() => run('PATCH', 'null')).toThrow(AppException);
  });
});
