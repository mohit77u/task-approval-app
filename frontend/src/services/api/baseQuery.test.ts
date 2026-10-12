import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store';
import { sessionEnded } from '@/store/actions';
import { authApi } from './authApi';
import { coldStartRetry } from './baseQuery';
import { tasksApi } from './tasksApi';

vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const errorBody = (code: string, statusCode = 401) => ({ statusCode, code, message: code, details: [] });
const emptyPage = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };
const pathOf = (request: Request): string => new URL(request.url).pathname;

describe('baseQuery', () => {
  beforeEach(() => {
    coldStartRetry.delaysMs = [0, 0, 0];
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('refreshes once when several requests find the access token expired, then retries them all', async () => {
    let refreshed = false;
    const calls = { refresh: 0, tasks: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = pathOf(request);
        if (path === '/api/auth/refresh') {
          calls.refresh += 1;
          await new Promise((resolve) => setTimeout(resolve, 20)); // keep it in flight while the others arrive
          refreshed = true;
          return json(200, { refreshed: true });
        }
        calls.tasks += 1;
        return refreshed ? json(200, emptyPage) : json(401, errorBody('TOKEN_EXPIRED'));
      }),
    );

    const store = makeStore();
    const results = await Promise.all([
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 })),
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 2, limit: 20 })),
      store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 3, limit: 20 })),
    ]);

    expect(calls.refresh).toBe(1);
    expect(results.every((result) => result.isSuccess)).toBe(true);
  });

  it('ends the session without a toast on a first visit when refresh fails', async () => {
    const { notify } = await import('@/lib/notify');
    // Both /auth/me and the follow-up /auth/refresh answer 401: there is no session at all.
    vi.stubGlobal('fetch', vi.fn(async () => json(401, errorBody('UNAUTHENTICATED'))));

    const store = makeStore();
    expect(store.getState().auth.status).toBe('loading');
    const result = await store.dispatch(authApi.endpoints.me.initiate());

    expect(result.isError).toBe(true);
    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(notify.error).not.toHaveBeenCalled();
    expect(notify.info).not.toHaveBeenCalled();
  });

  it('tells a signed-in user their session expired when refresh fails', async () => {
    const { notify } = await import('@/lib/notify');
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => (pathOf(request) === '/api/auth/login' ? json(200, { user }) : json(401, errorBody('TOKEN_EXPIRED')))),
    );

    const store = makeStore();
    // Sign in through the real login endpoint so the store is in the authenticated state, as it would be for a user.
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(store.getState().auth.status).toBe('authenticated');

    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(notify.info).toHaveBeenCalledWith('Your session has expired. Please sign in again.', expect.anything());
  });

  it('never tries to refresh when the login itself is rejected', async () => {
    const fetchMock = vi.fn(async () => json(401, errorBody('UNAUTHENTICATED')));
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'bad' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect((result.error as { handled?: boolean }).handled).toBeUndefined();
  });

  it('retries a GET that hits an idle (503) server and then succeeds', async () => {
    const responses = [json(503, '<html>wake up</html>'), json(503, '<html>wake up</html>'), json(200, emptyPage)];
    const fetchMock = vi.fn(async () => responses.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(result.isSuccess).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST after a network failure, so a task is never created twice', async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const store = makeStore();
    const result = await store.dispatch(
      tasksApi.endpoints.createTask.initiate({ title: 'T', description: 'D', priority: 'LOW', dueDate: '2030-01-01', assigneeId: 2 }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.error).toMatchObject({ code: 'NETWORK_ERROR' });
  });

  it('clears cached data when a different user signs in', async () => {
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => (pathOf(request) === '/api/auth/login' ? json(200, { user }) : json(200, emptyPage))),
    );

    const store = makeStore();
    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);

    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
  });

  it('exposes sessionEnded for logout flows', () => {
    const store = makeStore();
    store.dispatch(sessionEnded({ notify: false }));
    expect(store.getState().auth).toEqual({ user: null, status: 'unauthenticated' });
  });
});
