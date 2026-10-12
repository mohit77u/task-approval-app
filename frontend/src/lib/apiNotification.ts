import { ApiError } from '@/types/api';

export interface NotificationSpec {
  level: 'error' | 'warning' | 'info';
  message: string;
}

/** Decides how an API failure is announced. The single place that maps error codes to toast levels. */
export function notificationFor(error: ApiError): NotificationSpec | null {
  if (error.handled) return null;

  switch (error.code) {
    case 'STATE_CONFLICT':
      return { level: 'warning', message: error.message };
    case 'RATE_LIMITED':
      return {
        level: 'warning',
        message: error.retryAfterSeconds ? `Too many requests. Try again in ${error.retryAfterSeconds}s.` : error.message,
      };
    case 'VALIDATION_ERROR': {
      const [first, ...rest] = error.details;
      if (!first) return { level: 'error', message: error.message };
      return { level: 'error', message: rest.length ? `${first.message} (+${rest.length} more)` : first.message };
    }
    default:
      return { level: 'error', message: error.message };
  }
}
