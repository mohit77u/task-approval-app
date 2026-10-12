import { HistoryEntry, Paginated, Task, TaskPriority, TaskStatus } from '@/types/api';
import type { TransitionArg } from '@/lib/apiMessages';
import { baseApi } from './baseApi';

export interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  assigneeId?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: number;
}

export const tasksApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listTasks: build.query<Paginated<Task>, TaskFilters>({
      query: (filters) => ({ url: 'tasks', params: filters }),
      providesTags: (result) => [
        { type: 'Task', id: 'LIST' },
        ...(result?.items ?? []).map(({ id }) => ({ type: 'Task' as const, id })),
      ],
    }),
    getTask: build.query<Task, number>({
      query: (id) => `tasks/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Task', id }],
    }),
    getTaskHistory: build.query<HistoryEntry[], number>({
      query: (id) => `tasks/${id}/history`,
      providesTags: (_result, _error, id) => [{ type: 'History', id }],
    }),
    createTask: build.mutation<Task, TaskInput>({
      query: (body) => ({ url: 'tasks', method: 'POST', body }),
      invalidatesTags: [{ type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    updateTask: build.mutation<Task, { id: number; changes: Partial<TaskInput> }>({
      query: ({ id, changes }) => ({ url: `tasks/${id}`, method: 'PATCH', body: changes }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'Task', id }, { type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    deleteTask: build.mutation<void, number>({
      query: (id) => ({ url: `tasks/${id}`, method: 'DELETE' }),
      // Deliberately not the deleted task's own tag: the open detail page is subscribed to it and would refetch
      // GET /tasks/:id (404) before it navigates away, flashing "Task not found" and an error toast after "Task deleted".
      invalidatesTags: [{ type: 'Task', id: 'LIST' }, 'Dashboard'],
    }),
    // `from` is not sent: it only lets the success toast tell an approval apart from a rejection.
    transitionTask: build.mutation<Task, TransitionArg>({
      query: ({ id, to, note }) => ({ url: `tasks/${id}/transition`, method: 'POST', body: { to, ...(note ? { note } : {}) } }),
      invalidatesTags: (_result, _error, { id }) => [
        { type: 'Task', id },
        { type: 'Task', id: 'LIST' },
        { type: 'History', id },
        'Dashboard',
      ],
    }),
  }),
});

export const {
  useListTasksQuery,
  useGetTaskQuery,
  useGetTaskHistoryQuery,
  useCreateTaskMutation,
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useTransitionTaskMutation,
} = tasksApi;
