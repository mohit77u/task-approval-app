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

/**
 * True from the Tailwind `lg` breakpoint (1024px) up; defaults to desktop when it cannot be measured.
 * `lg`, not `md`: from 768px the sidebar takes 240px, leaving ~460px, far too little for a five-column table.
 */
export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1024px)', true);
}
