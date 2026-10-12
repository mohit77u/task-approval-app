import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseTaskFilters, toSearchString } from '@/lib/taskFilters';
import type { TaskFilters } from '@/services/api/tasksApi';
import { useDebouncedValue } from './useDebouncedValue';

type FilterKey = 'status' | 'priority' | 'assigneeId';

/**
 * Task-list filters, stored in the URL so refresh, back/forward and shared links all work. Search typing is debounced
 * before it reaches the URL (and therefore before it triggers a request).
 */
export function useTaskFilters(): {
  filters: TaskFilters & { page: number };
  searchInput: string;
  setSearchInput: (value: string) => void;
  setFilter: (key: FilterKey, value: string | number | undefined) => void;
  setPage: (page: number) => void;
  reset: () => void;
} {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useMemo(() => parseTaskFilters(searchParams), [searchParams]);

  const [searchInput, setSearchInput] = useState(filters.search ?? '');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const update = useCallback(
    (changes: Partial<TaskFilters>) => {
      const next: TaskFilters = { ...parseTaskFilters(searchParams), ...changes };
      // Changing any filter starts again from the first page; only an explicit page change keeps it.
      if (!('page' in changes)) next.page = 1;
      const query = toSearchString(next);
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // The debounce effect must not re-run just because `update` changed identity (it does on every URL change), or a stale
  // debounced value would overwrite a Reset. Keep the latest `update` in a ref and depend only on the debounced text.
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  }, [update]);

  // The last search text this hook knows the URL to have. Distinguishes our own URL writes from external changes.
  const appliedSearch = useRef(filters.search ?? '');

  useEffect(() => {
    const next = debouncedSearch.trim();
    if (next === appliedSearch.current) return;
    appliedSearch.current = next;
    updateRef.current({ search: next || undefined });
  }, [debouncedSearch]);

  // External URL change (Reset button, browser back): mirror it into the input.
  useEffect(() => {
    const external = filters.search ?? '';
    if (external !== appliedSearch.current) {
      appliedSearch.current = external;
      setSearchInput(external);
    }
  }, [filters.search]);

  const setFilter = useCallback(
    (key: FilterKey, value: string | number | undefined) => update({ [key]: value } as Partial<TaskFilters>),
    [update],
  );
  const setPage = useCallback((page: number) => update({ page }), [update]);
  const reset = useCallback(() => {
    // Clear the input directly as well: when the URL is already filter-free (text still inside the debounce window) the
    // router call below changes nothing, so the external-change effect would never fire and the pending text would win.
    appliedSearch.current = '';
    setSearchInput('');
    router.replace(pathname, { scroll: false });
  }, [pathname, router]);

  return { filters, searchInput, setSearchInput, setFilter, setPage, reset };
}
