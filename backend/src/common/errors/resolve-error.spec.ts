import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';
import { resolveError } from './resolve-error';

describe('resolveError', () => {
  it('passes AppException through unchanged', () => {
    const resolved = resolveError(AppException.stateConflict('changed'));
    expect(resolved).toEqual({
      statusCode: 409,
      code: ErrorCode.STATE_CONFLICT,
      message: 'changed',
      details: undefined,
    });
  });

  it('keeps validation details', () => {
    const resolved = resolveError(
      AppException.validation([
        { field: 'title', message: 'must not be empty' },
      ]),
    );
    expect(resolved.statusCode).toBe(422);
    expect(resolved.code).toBe(ErrorCode.VALIDATION_ERROR);
    expect(resolved.details).toEqual([
      { field: 'title', message: 'must not be empty' },
    ]);
  });

  it('maps framework HttpExceptions to stable codes', () => {
    expect(resolveError(new NotFoundException()).code).toBe(
      ErrorCode.NOT_FOUND,
    );
    expect(resolveError(new ForbiddenException()).code).toBe(
      ErrorCode.FORBIDDEN,
    );
    expect(resolveError(new BadRequestException('bad json')).code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
  });

  it('maps throttling to RATE_LIMITED', () => {
    const resolved = resolveError(new ThrottlerException());
    expect(resolved.statusCode).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(resolved.code).toBe(ErrorCode.RATE_LIMITED);
  });

  it('hides internals of unknown errors', () => {
    const resolved = resolveError(new Error('SQL syntax error near ...'));
    expect(resolved).toMatchObject({
      statusCode: 500,
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Something went wrong',
    });
  });
});
