import { DashboardData } from '@/types/api';
import { baseApi } from './baseApi';

export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getDashboard: build.query<DashboardData, void>({ query: () => 'dashboard', providesTags: ['Dashboard'] }),
  }),
});

export const { useGetDashboardQuery } = dashboardApi;
