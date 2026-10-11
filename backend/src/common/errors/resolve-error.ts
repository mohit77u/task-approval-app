import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException, ErrorDetail } from './app.exception';
import { ErrorCode } from './error-codes';

export interface ResolvedError {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: ErrorDetail[];
}

const CODE_BY_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

/** Pure mapping from any thrown value to the public error contract. Kept separate from the filter so it is trivially testable. */
export function resolveError(exception: unknown): ResolvedError {
  if (exception instanceof AppException) {
    return {
      statusCode: exception.getStatus(),
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }
  if (exception instanceof ThrottlerException) {
    return {
      statusCode: HttpStatus.TOO_MANY_REQUESTS,
      code: ErrorCode.RATE_LIMITED,
      message: 'Too many requests. Please try again shortly.',
    };
  }
  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    return {
      statusCode,
      code: CODE_BY_STATUS[statusCode] ?? ErrorCode.INTERNAL_ERROR,
      message: exception.message,
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Something went wrong',
  };
}
