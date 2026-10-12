import { useCallback, useRef, useState } from 'react';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { normalizeError } from '@/lib/normalizeError';
import type { ApiError } from '@/types/api';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * Runs one API action (typically `() => trigger(arg).unwrap()`) and reports the outcome as a value instead of throwing.
 * It does NOT toast: success and error toasts come from the notification middleware. It exists for two things the
 * middleware cannot do: a double-submit guard and a pending flag for the calling component.
 */
export function useApiAction(): { run: <T>(request: () => Promise<T>) => Promise<ActionResult<T>>; isPending: boolean } {
  const [isPending, setIsPending] = useState(false);
  // A ref, not state: two clicks in the same tick both see the stale `isPending === false`.
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(request: () => Promise<T>): Promise<ActionResult<T>> => {
    if (inFlight.current) return { ok: false, error: normalizeError(new Error('Another request is already in progress.')) };
    inFlight.current = true;
    setIsPending(true);
    try {
      return { ok: true, data: await request() };
    } catch (error) {
      return { ok: false, error: normalizeError(error) };
    } finally {
      inFlight.current = false;
      setIsPending(false);
    }
  }, []);

  return { run, isPending };
}

/** Copies backend field errors onto a react-hook-form. Returns true if at least one field was matched. */
export function applyFieldErrors<T extends FieldValues>(error: ApiError, setError: UseFormSetError<T>, fields: readonly string[]): boolean {
  let matched = false;
  for (const detail of error.details) {
    if (fields.includes(detail.field)) {
      setError(detail.field as Path<T>, { type: 'server', message: detail.message });
      matched = true;
    }
  }
  return matched;
}
