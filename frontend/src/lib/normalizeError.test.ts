import { describe, expect, it } from 'vitest';
import { normalizeError } from './normalizeError';

describe('normalizeError', () => {
  it('maps a backend error body, including field details', () => {
    const error = normalizeError({
      status: 422,
      data: {
        statusCode: 422,
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'title', message: 'title should not be empty' }],
      },
    });
    expect(error).toEqual({
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [{ field: 'title', message: 'title should not be empty' }],
    });
  });

  it('turns a network failure into a friendly NETWORK_ERROR', () => {
    const error = normalizeError({ status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' });
    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.statusCode).toBe(0);
    expect(error.message).toMatch(/reach the server/i);
  });

  it('treats a gateway page that is not JSON as an unavailable server', () => {
    const error = normalizeError({ status: 'PARSING_ERROR', originalStatus: 503, data: '<html>Service Unavailable</html>', error: 'x' });
    expect(error).toMatchObject({ statusCode: 503, code: 'NETWORK_ERROR' });
    expect(error.message).not.toContain('<html>');
  });

  it('falls back to a status-based message when the body is not our error shape', () => {
    const error = normalizeError({ status: 500, data: 'oops' });
    expect(error).toMatchObject({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Something went wrong on our side. Please try again.' });
  });

  it('reads Retry-After for rate limiting', () => {
    const error = normalizeError(
      { status: 429, data: { statusCode: 429, code: 'RATE_LIMITED', message: 'Too many requests. Please try again shortly.' } },
      '42',
    );
    expect(error.retryAfterSeconds).toBe(42);
  });

  it('passes through an ApiError unchanged and survives unknown input', () => {
    const existing = { statusCode: 403, code: 'FORBIDDEN' as const, message: 'No', details: [] };
    expect(normalizeError(existing)).toBe(existing);
    expect(normalizeError(new Error('boom'))).toMatchObject({ code: 'UNKNOWN_ERROR', message: 'boom' });
    expect(normalizeError(undefined)).toMatchObject({ code: 'UNKNOWN_ERROR' });
  });
});
