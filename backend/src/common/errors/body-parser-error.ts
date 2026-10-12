import type { NextFunction, Request, Response } from 'express';
import { AppException } from './app.exception';
import { ErrorCode } from './error-codes';

/** Shape of the errors raised by Express's body parsers (the `http-errors` objects from `body-parser`/`raw-body`). */
interface BodyParserError {
  type: string;
  status: number;
}

function isBodyParserError(error: unknown): error is BodyParserError {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' && typeof candidate.status === 'number'
  );
}

const MESSAGE_BY_TYPE: Record<string, string> = {
  'entity.parse.failed': 'Request body is not valid JSON',
  'entity.too.large': 'Request body is too large',
  'parameters.too.many': 'Request body has too many parameters',
  'encoding.unsupported': 'Unsupported request body encoding',
  'charset.unsupported': 'Unsupported request body charset',
};

/**
 * Turns a body-parser failure into the public error contract. Returns undefined for anything else, and for parser
 * failures that are server-side (5xx), which the filter then reports as INTERNAL_ERROR. The parser's own message is not
 * passed on: it echoes fragments of the body and engine internals.
 */
export function fromBodyParserError(error: unknown): AppException | undefined {
  if (!isBodyParserError(error) || error.status >= 500) return undefined;
  return new AppException(
    error.status,
    ErrorCode.VALIDATION_ERROR,
    MESSAGE_BY_TYPE[error.type] ?? 'Invalid request body',
  );
}

/**
 * Express error middleware placed right after the body parsers. Nest's own handler would otherwise turn a JSON syntax
 * error into a generic BadRequestException carrying the parser message, and a too-large body into a 500.
 */
export function bodyParserErrorMiddleware(
  error: unknown,
  _request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(fromBodyParserError(error) ?? error);
}
