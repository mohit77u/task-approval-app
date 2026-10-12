import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskFilters } from './useTaskFilters';

// A stand-in for the Next router: replace() records the call and applies it to the "URL" the hook reads next render.
const nav = vi.hoisted(() => ({ query: '', replace: vi.fn<(url: string) => void>() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace }),
  usePathname: () => '/tasks',
  useSearchParams: () => new URLSearchParams(nav.query),
}));

const setup = (query = '') => {
  nav.query = query;
  nav.replace.mockImplementation((url: string) => {
    nav.query = url.includes('?') ? url.slice(url.indexOf('?') + 1) : '';
  });
  return renderHook(() => useTaskFilters());
};

describe('useTaskFilters', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    nav.replace = vi.fn();
  });
  afterEach(() => vi.useRealTimers());

  it('writes the URL once after fast typing stops', () => {
    const { result } = setup();
    for (const text of ['r', 're', 'rep', 'repo']) {
      act(() => result.current.setSearchInput(text));
      act(() => void vi.advanceTimersByTime(100));
    }
    expect(nav.replace).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(300));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/tasks?search=repo', { scroll: false });
  });

  it('Reset inside the debounce window leaves the URL clean and the input empty', () => {
    const { result } = setup();
    act(() => result.current.setSearchInput('draft'));
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current.reset());
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current.searchInput).toBe('');
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace).toHaveBeenCalledWith('/tasks', { scroll: false });
    expect(nav.query).toBe('');
  });

  it('mirrors an external URL change into the search input', () => {
    const { result, rerender } = setup('search=old');
    expect(result.current.searchInput).toBe('old');

    nav.query = 'search=fromBack';
    rerender();

    expect(result.current.searchInput).toBe('fromBack');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('ignores invalid URL params', () => {
    const { result } = setup('status=BOGUS&priority=NOPE&assigneeId=abc&page=-3');
    expect(result.current.filters).toEqual({ page: 1 });
  });

  it('resets to page 1 when a filter changes, but keeps the page on an explicit page change', () => {
    const { result, rerender } = setup('page=4&status=PENDING');
    act(() => result.current.setFilter('priority', 'HIGH'));
    expect(nav.replace).toHaveBeenLastCalledWith('/tasks?status=PENDING&priority=HIGH', { scroll: false });
    rerender(); // the router would re-render with the new URL

    act(() => result.current.setPage(3));
    expect(nav.replace).toHaveBeenLastCalledWith('/tasks?status=PENDING&priority=HIGH&page=3', { scroll: false });
  });
});
