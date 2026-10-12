import { TaskComment } from '@/types/api';
import { baseApi } from './baseApi';

export const commentsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listComments: build.query<TaskComment[], number>({
      query: (taskId) => `tasks/${taskId}/comments`,
      providesTags: (_result, _error, taskId) => [{ type: 'Comment', id: taskId }],
    }),
    createComment: build.mutation<TaskComment, { taskId: number; body: string }>({
      query: ({ taskId, body }) => ({ url: `tasks/${taskId}/comments`, method: 'POST', body: { body } }),
      invalidatesTags: (_result, _error, { taskId }) => [{ type: 'Comment', id: taskId }],
    }),
  }),
});

export const { useListCommentsQuery, useCreateCommentMutation } = commentsApi;
