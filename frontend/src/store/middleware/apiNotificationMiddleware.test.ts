import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store';
import { tasksApi } from '@/services/api/tasksApi';

vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const json = (status: number, body: unknown): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiNotificationMiddleware', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows a success toast for a mutation', async () => {
    const { notify } = await import('@/lib/notify');
    vi.stubGlobal('fetch', vi.fn(async () => json(204, null)));
    await makeStore().dispatch(tasksApi.endpoints.deleteTask.initiate(1));
    expect(notify.success).toHaveBeenCalledWith('Task deleted');
  });

  it('does not toast a successful query', async () => {
    const { notify } = await import('@/lib/notify');
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } })));
    await makeStore().dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.error).not.toHaveBeenCalled();
  });

  it('shows an error toast for a failed mutation but no success toast', async () => {
    const { notify } = await import('@/lib/notify');
    vi.stubGlobal('fetch', vi.fn(async () => json(404, { statusCode: 404, code: 'NOT_FOUND', message: 'Task not found', details: [] })));
    await makeStore().dispatch(tasksApi.endpoints.deleteTask.initiate(1));
    expect(notify.success).not.toHaveBeenCalled();
    expect(notify.error).toHaveBeenCalledWith('Task not found');
  });
});
