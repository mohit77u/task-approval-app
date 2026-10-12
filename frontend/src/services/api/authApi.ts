import { User } from '@/types/api';
import { baseApi } from './baseApi';

export interface LoginRequest {
  email: string;
  password: string;
}

export const authApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    login: build.mutation<{ user: User }, LoginRequest>({
      query: (body) => ({ url: 'auth/login', method: 'POST', body }),
    }),
    logout: build.mutation<void, void>({
      query: () => ({ url: 'auth/logout', method: 'POST' }),
    }),
    me: build.query<User, void>({ query: () => 'auth/me' }),
  }),
});

export const { useLoginMutation, useLogoutMutation, useMeQuery } = authApi;
