import { useSyncExternalStore } from 'react';

/**
 * Subscribes to a CSS media query. Used where two layouts must not coexist in the DOM (duplicate links would break
 * accessible-name lookups and screen-reader navigation), so CSS-only show/hide is not enough.
 *
 * @param serverDefault value used during SSR/hydration and where matchMedia is missing (jsdom); React re-renders with the real value right after hydration.
 */
export function useMediaQuery(query: string, serverDefault: boolean): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => undefined;
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => (typeof window.matchMedia === 'function' ? window.matchMedia(query).matches : serverDefault),
    () => serverDefault,
  );
}

/** True from the Tailwind `md` breakpoint (768px) up; defaults to desktop when it cannot be measured. */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 768px)', true);
}
