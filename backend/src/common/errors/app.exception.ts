import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

export interface ErrorDetail {
  field: string;
  message: string;
}

/** The only exception type domain code throws, so every failure carries a stable, client-facing `code`. */
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message, status);
  }

  static unauthenticated(message = 'Authentication required'): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHENTICATED, message);
  }

  static tokenExpired(): AppException {
    return new AppException(HttpStatus.UNAUTHORIZED, ErrorCode.TOKEN_EXPIRED, 'Access token expired');
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppException {
    return new AppException(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message);
  }

  static notFound(what = 'Resource'): AppException {
    return new AppException(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, `${what} not found`);
  }

  static validation(details: ErrorDetail[], message = 'Validation failed'): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static invalidTransition(message: string): AppException {
    return new AppException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.INVALID_TRANSITION, message);
  }

  static stateConflict(message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, ErrorCode.STATE_CONFLICT, message);
  }

  static conflict(message: string): AppException {
    return new AppException(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message);
  }
}
