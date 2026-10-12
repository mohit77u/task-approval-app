'use client';

import { useRouter } from 'next/navigation';
import { ReactNode, useEffect } from 'react';
import { ErrorState } from '@/components/common/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { useMeQuery } from '@/services/api/authApi';
import { useAppSelector } from '@/store/hooks';

/**
 * Client-side gate for every authenticated page. It restores the session through GET /auth/me (the API layer refreshes
 * an expired access token transparently) and sends visitors without a session to the login page. This is UX only: the
 * backend independently rejects every unauthenticated request.
 */
export function AuthGate({ children }: { children: ReactNode }): React.JSX.Element {
  const router = useRouter();
  const status = useAppSelector((state) => state.auth.status);
  // Only ask once: after login the user is already in the store, and after a definite 401 `status` is no longer 'loading'.
  const me = useMeQuery(undefined, { skip: status !== 'loading' });

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/login');
  }, [status, router]);

  if (status === 'authenticated') return <>{children}</>;

  // A 503/429/network failure says nothing about the session, so `status` stays 'loading'. Without this branch the
  // visitor would stare at a spinner forever; the error toast comes from the middleware, here we offer a retry.
  if (status === 'loading' && me.isError) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4">
        <ErrorState
          title="Cannot verify your session"
          message="We could not reach the server to check your session. Check your connection and try again."
          onRetry={() => void me.refetch()}
          retrying={me.isFetching}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto mt-24 max-w-md space-y-3 px-4" aria-busy="true" aria-label="Loading your session">
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
