import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
  PayloadTooLargeException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';
import { fromBodyParserError } from './body-parser-error';
import { resolveError } from './resolve-error';

/** What body-parser hands to `next()`: an http-errors object with `type` and `status`. */
function parserError(type: string, status: number, message: string): Error {
  return Object.assign(new SyntaxError(message), { type, status });
}

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

  it('maps statuses without a dedicated code instead of reporting INTERNAL_ERROR', () => {
    expect(resolveError(new PayloadTooLargeException())).toMatchObject({
      statusCode: 413,
      code: ErrorCode.VALIDATION_ERROR,
    });
    expect(
      resolveError(new ServiceUnavailableException('Database unavailable')),
    ).toEqual({
      statusCode: 503,
      code: ErrorCode.SERVICE_UNAVAILABLE,
      message: 'Database unavailable',
    });
    expect(resolveError(new HttpException('teapot', 418)).code).toBe(
      ErrorCode.VALIDATION_ERROR,
    );
    expect(resolveError(new HttpException('bad gateway', 502)).code).toBe(
      ErrorCode.INTERNAL_ERROR,
    );
  });

  it('maps malformed JSON to 400 VALIDATION_ERROR without echoing the parser message', () => {
    const resolved = resolveError(
      parserError('entity.parse.failed', 400, 'Unexpected token } in JSON'),
    );
    expect(resolved).toMatchObject({
      statusCode: 400,
      code: ErrorCode.VALIDATION_ERROR,
      message: 'Request body is not valid JSON',
    });
  });

  it('maps an oversized body to 413 and an unsupported encoding to 415', () => {
    expect(
      resolveError(parserError('entity.too.large', 413, 'too large')),
    ).toMatchObject({ statusCode: 413, code: ErrorCode.VALIDATION_ERROR });
    expect(
      resolveError(parserError('encoding.unsupported', 415, 'gzip?')),
    ).toMatchObject({ statusCode: 415, code: ErrorCode.VALIDATION_ERROR });
  });

  it('only converts client-side body-parser failures', () => {
    expect(fromBodyParserError(new Error('plain'))).toBeUndefined();
    expect(
      fromBodyParserError(parserError('stream.not.readable', 500, 'x')),
    ).toBeUndefined();
    expect(
      fromBodyParserError(parserError('request.aborted', 400, 'x'))?.message,
    ).toBe('Invalid request body');
  });
});
