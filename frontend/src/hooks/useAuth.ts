import { useCallback } from 'react';
import { useLogoutMutation } from '@/services/api/authApi';
import { sessionEnded } from '@/store/actions';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import type { AuthStatus } from '@/store/slices/authSlice';
import type { User } from '@/types/api';

export interface UseAuthResult {
  user: User | null;
  status: AuthStatus;
  isAdmin: boolean;
  isEmployee: boolean;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
}

export function useAuth(): UseAuthResult {
  const dispatch = useAppDispatch();
  const { user, status } = useAppSelector((state) => state.auth);
  const [logoutRequest, { isLoading: isLoggingOut }] = useLogoutMutation();

  const logout = useCallback(async (): Promise<void> => {
    // Even if the request fails (e.g. offline) the local session must end; the error toast still explains what happened.
    await logoutRequest()
      .unwrap()
      .catch(() => undefined);
    dispatch(sessionEnded({ notify: false }));
  }, [dispatch, logoutRequest]);

  return {
    user,
    status,
    isAdmin: user?.role.code === 'ADMIN',
    isEmployee: user?.role.code === 'EMPLOYEE',
    logout,
    isLoggingOut,
  };
}
