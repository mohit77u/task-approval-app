import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedValue } from './useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('only updates after the delay and restarts the timer on every change', () => {
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 300), { initialProps: { value: 'a' } });

    rerender({ value: 'ab' });
    act(() => vi.advanceTimersByTime(200));
    rerender({ value: 'abc' });
    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('a'); // 400ms passed in total, but the last change was only 200ms ago

    act(() => vi.advanceTimersByTime(100));
    expect(result.current).toBe('abc');
  });
});
