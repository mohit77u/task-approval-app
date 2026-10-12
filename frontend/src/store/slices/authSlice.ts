import { createSlice } from '@reduxjs/toolkit';
import { authApi } from '@/services/api/authApi';
import { User } from '@/types/api';
import { sessionEnded } from '../actions';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: User | null;
  status: AuthStatus;
}

const initialState: AuthState = { user: null, status: 'loading' };

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(sessionEnded, () => ({ user: null, status: 'unauthenticated' as const }))
      .addMatcher(authApi.endpoints.me.matchFulfilled, (_state, { payload }) => ({ user: payload, status: 'authenticated' as const }))
      .addMatcher(authApi.endpoints.login.matchFulfilled, (_state, { payload }) => ({ user: payload.user, status: 'authenticated' as const }));
  },
});

export default authSlice.reducer;
