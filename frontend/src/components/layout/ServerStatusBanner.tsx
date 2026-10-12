'use client';

import { Loader2 } from 'lucide-react';
import { useAppSelector } from '@/store/hooks';

/** Shown while the free-tier backend is waking up, so a slow first load does not look like a broken app. */
export function ServerStatusBanner(): React.JSX.Element | null {
  const waking = useAppSelector((state) => state.ui.serverWaking);
  if (!waking) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Waking up the server. The first request can take up to a minute.
    </div>
  );
}
