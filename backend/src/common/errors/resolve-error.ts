import { HttpException, HttpStatus } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { AppException, ErrorDetail } from './app.exception';
import { fromBodyParserError } from './body-parser-error';
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
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.NOT_FOUND,
  [HttpStatus.GONE]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

/** Statuses without an entry: any other 4xx is still the client's request being refused, never a server fault. */
function codeForStatus(statusCode: number): ErrorCode {
  const mapped = CODE_BY_STATUS[statusCode];
  if (mapped) return mapped;
  return statusCode < 500
    ? ErrorCode.VALIDATION_ERROR
    : ErrorCode.INTERNAL_ERROR;
}

/** Pure mapping from any thrown value to the public error contract. Kept separate from the filter so it is trivially testable. */
export function resolveError(exception: unknown): ResolvedError {
  // Normally already converted by bodyParserErrorMiddleware; handled here too so the contract does not depend on order.
  const bodyError = fromBodyParserError(exception);
  if (bodyError) return resolveError(bodyError);
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
      code: codeForStatus(statusCode),
      message: exception.message,
    };
  }
  return {
    statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_ERROR,
    message: 'Something went wrong',
  };
}
