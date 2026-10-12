import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';

/** Shared root of every endpoint group. Feature files add their endpoints with `injectEndpoints`. */
export const baseApi = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Task', 'Comment', 'History', 'Dashboard', 'User', 'Role'],
  refetchOnFocus: true,
  refetchOnReconnect: true,
  endpoints: () => ({}),
});
