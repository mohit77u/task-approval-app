import { Paginated, Role, RoleCode, User } from '@/types/api';
import { baseApi } from './baseApi';

export interface UserInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId: number;
}

export interface UserUpdateInput {
  id: number;
  name?: string;
  email?: string;
  /** `null` clears the phone. */
  phone?: string | null;
  /** Setting a password signs the user out everywhere. */
  password?: string;
}

export const usersApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listUsers: build.query<Paginated<User>, { roleCode?: RoleCode; page?: number; limit?: number }>({
      query: (params) => ({ url: 'users', params }),
      providesTags: ['User'],
    }),
    listRoles: build.query<Role[], void>({ query: () => 'roles', providesTags: ['Role'] }),
    createUser: build.mutation<User, UserInput>({
      query: (body) => ({ url: 'users', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    updateUser: build.mutation<User, UserUpdateInput>({
      query: ({ id, ...body }) => ({ url: `users/${id}`, method: 'PATCH', body }),
      invalidatesTags: ['User'],
    }),
    deleteUser: build.mutation<void, number>({
      query: (id) => ({ url: `users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['User'],
    }),
  }),
});

export const {
  useListUsersQuery,
  useListRolesQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
} = usersApi;
