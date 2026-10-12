import { ApiError, ApiErrorDetail, ErrorCode } from '@/types/api';

const GATEWAY_STATUSES = new Set([502, 503, 504]);

const MESSAGE_BY_STATUS: Record<number, { code: ErrorCode; message: string }> = {
  400: { code: 'VALIDATION_ERROR', message: 'The request was not valid.' },
  401: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
  403: { code: 'FORBIDDEN', message: 'You do not have permission to do that.' },
  404: { code: 'NOT_FOUND', message: 'We could not find what you were looking for.' },
  429: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' },
  500: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' },
};

const SERVER_UNAVAILABLE = 'The server is not responding right now. Please try again in a moment.';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export function isApiError(value: unknown): value is ApiError {
  return isRecord(value) && typeof value.statusCode === 'number' && typeof value.code === 'string' && typeof value.message === 'string' && Array.isArray(value.details);
}

function parseDetails(value: unknown): ApiErrorDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ApiErrorDetail => isRecord(item) && typeof item.field === 'string' && typeof item.message === 'string',
  );
}

function parseRetryAfter(header: string | null | undefined): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : undefined;
}

function fromStatus(statusCode: number, retryAfterSeconds?: number): ApiError {
  if (GATEWAY_STATUSES.has(statusCode)) {
    return { statusCode, code: 'NETWORK_ERROR', message: SERVER_UNAVAILABLE, details: [] };
  }
  const known = MESSAGE_BY_STATUS[statusCode] ?? MESSAGE_BY_STATUS[500];
  return { statusCode, code: known.code, message: known.message, details: [], retryAfterSeconds };
}

/**
 * Collapses everything that can go wrong (our backend's error body, RTK Query's FETCH_ERROR / PARSING_ERROR, plain
 * Errors) into one ApiError, so the rest of the UI never has to know which layer failed.
 */
export function normalizeError(error: unknown, retryAfterHeader?: string | null): ApiError {
  if (isApiError(error)) return error;
  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);

  if (isRecord(error) && 'status' in error) {
    const { status } = error;

    if (typeof status === 'number') {
      const body = error.data;
      if (isRecord(body) && typeof body.code === 'string' && typeof body.message === 'string') {
        return {
          statusCode: status,
          code: body.code as ErrorCode,
          message: body.message,
          details: parseDetails(body.details),
          ...(retryAfterSeconds ? { retryAfterSeconds } : {}),
        };
      }
      return fromStatus(status, retryAfterSeconds);
    }

    if (status === 'PARSING_ERROR' && typeof error.originalStatus === 'number') {
      return fromStatus(error.originalStatus, retryAfterSeconds);
    }

    if (status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR') {
      return { statusCode: 0, code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check your connection and try again.', details: [] };
    }
  }

  const message = error instanceof Error && error.message ? error.message : 'An unexpected error occurred.';
  return { statusCode: 0, code: 'UNKNOWN_ERROR', message, details: [] };
}
