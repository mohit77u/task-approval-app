import { describe, expect, it } from 'vitest';
import { ApiError } from '@/types/api';
import { notificationFor } from './apiNotification';

const base: ApiError = { statusCode: 400, code: 'UNKNOWN_ERROR', message: 'Nope', details: [] };

describe('notificationFor', () => {
  it('shows ordinary failures as errors with the backend message', () => {
    expect(notificationFor({ ...base, statusCode: 403, code: 'FORBIDDEN', message: 'Not allowed' })).toEqual({ level: 'error', message: 'Not allowed' });
    expect(notificationFor({ ...base, statusCode: 0, code: 'NETWORK_ERROR', message: 'Offline' })).toEqual({ level: 'error', message: 'Offline' });
  });

  it('shows a state conflict as a warning', () => {
    expect(notificationFor({ ...base, statusCode: 409, code: 'STATE_CONFLICT', message: 'Changed by someone else' })).toEqual({
      level: 'warning',
      message: 'Changed by someone else',
    });
  });

  it('keeps a duplicate-resource conflict an error', () => {
    expect(notificationFor({ ...base, statusCode: 409, code: 'CONFLICT', message: 'Email taken' })?.level).toBe('error');
  });

  it('shows rate limiting as a warning with the wait time when known', () => {
    expect(notificationFor({ ...base, statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down', retryAfterSeconds: 30 })).toEqual({
      level: 'warning',
      message: 'Too many requests. Try again in 30s.',
    });
    expect(notificationFor({ ...base, statusCode: 429, code: 'RATE_LIMITED', message: 'Slow down' })).toEqual({ level: 'warning', message: 'Slow down' });
  });

  it('summarises validation errors by their first detail', () => {
    const one = notificationFor({ ...base, statusCode: 422, code: 'VALIDATION_ERROR', message: 'Validation failed', details: [{ field: 'title', message: 'title should not be empty' }] });
    expect(one).toEqual({ level: 'error', message: 'title should not be empty' });

    const many = notificationFor({
      ...base,
      statusCode: 422,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details: [
        { field: 'title', message: 'title should not be empty' },
        { field: 'dueDate', message: 'dueDate must be a valid date' },
      ],
    });
    expect(many).toEqual({ level: 'error', message: 'title should not be empty (+1 more)' });
  });

  it('stays silent for errors the API layer already handled', () => {
    expect(notificationFor({ ...base, handled: true })).toBeNull();
  });
});

describe('SERVICE_UNAVAILABLE', () => {
  it('is announced as a friendly error-level toast', () => {
    const spec = notificationFor({ statusCode: 503, code: 'SERVICE_UNAVAILABLE', message: 'db down', details: [] });
    expect(spec).toEqual({ level: 'error', message: 'The service is temporarily unavailable. Please try again in a moment.' });
  });
});
