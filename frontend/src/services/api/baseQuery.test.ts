import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeStore } from '@/store';
import { sessionEnded } from '@/store/actions';
import { authApi } from './authApi';
import { coldStartRetry } from './baseQuery';
import { tasksApi } from './tasksApi';

vi.mock('@/lib/notify', () => ({ notify: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn(), dismiss: vi.fn() } }));

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const errorBody = (code: string, statusCode = 401) => ({ statusCode, code, message: code, details: [] });
const emptyPage = { items: [], meta: { page: 1, limit: 20, total: 0, totalPages: 1 } };
const pathOf = (request: Request): string => new URL(request.url).pathname;

describe('baseQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    coldStartRetry.delaysMs = [0, 0, 0];
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('refreshes once when several requests find the access token expired, then retries them all', async () => {
    let refreshed = false;
    const calls = { refresh: 0, tasks: 0 };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = pathOf(request);
        if (path === '/api/v1/auth/refresh') {
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
      vi.fn(async (request: Request) => (pathOf(request) === '/api/v1/auth/login' ? json(200, { user }) : json(401, errorBody('TOKEN_EXPIRED')))),
    );

    const store = makeStore();
    // Sign in through the real login endpoint so the store is in the authenticated state, as it would be for a user.
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(store.getState().auth.status).toBe('authenticated');

    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(store.getState().auth.status).toBe('unauthenticated');
    expect(notify.info).toHaveBeenCalledWith('Your session has expired. Please sign in again.', expect.anything());
  });

  it('does not log the user out when a first-visit refresh fails after they signed in', async () => {
    const { notify } = await import('@/lib/notify');
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    let answerRefresh: () => void = () => undefined;
    const refreshGate = new Promise<void>((resolve) => {
      answerRefresh = resolve;
    });
    let refreshStarted: () => void = () => undefined;
    const refreshStartedSignal = new Promise<void>((resolve) => {
      refreshStarted = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = pathOf(request);
        if (path === '/api/v1/auth/login') return json(200, { user });
        if (path === '/api/v1/auth/refresh') {
          refreshStarted();
          await refreshGate; // the answer arrives only after the login below has completed
          return json(401, errorBody('UNAUTHENTICATED'));
        }
        return json(401, errorBody('UNAUTHENTICATED'));
      }),
    );

    const store = makeStore();
    const me = store.dispatch(authApi.endpoints.me.initiate());
    await refreshStartedSignal;
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));
    expect(store.getState().auth.status).toBe('authenticated');

    answerRefresh();
    await me;
    await new Promise((resolve) => setTimeout(resolve, 0)); // let any deferred cache wipe run

    expect(store.getState().auth.status).toBe('authenticated');
    expect(notify.info).not.toHaveBeenCalled();
  });

  it('does not refetch a deleted task, so the detail page never shows a false "not found"', async () => {
    const paths: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        paths.push(`${request.method} ${pathOf(request)}`);
        if (request.method === 'DELETE') return json(204, null);
        return pathOf(request) === '/api/v1/tasks/7' ? json(404, errorBody('NOT_FOUND', 404)) : json(200, emptyPage);
      }),
    );
    const store = makeStore();
    // The detail page's subscription stays open while the delete runs.
    const task = { id: 7, title: 'T' };
    store.dispatch(tasksApi.util.upsertQueryData('getTask', 7, task as never));
    const sub = store.dispatch(tasksApi.endpoints.getTask.initiate(7));
    await sub;
    paths.length = 0;

    await store.dispatch(tasksApi.endpoints.deleteTask.initiate(7));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(paths).toContain('DELETE /api/v1/tasks/7');
    expect(paths).not.toContain('GET /api/v1/tasks/7');
    sub.unsubscribe();
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

  it('retries a GET that gets a SERVICE_UNAVAILABLE JSON 503, but never a POST', async () => {
    const down = (): Response => json(503, errorBody('SERVICE_UNAVAILABLE', 503));
    const getMock = vi.fn().mockResolvedValueOnce(down()).mockResolvedValueOnce(json(200, emptyPage));
    vi.stubGlobal('fetch', getMock);
    const got = await makeStore().dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(got.isSuccess).toBe(true);
    expect(getMock).toHaveBeenCalledTimes(2);

    const postMock = vi.fn(async () => down());
    vi.stubGlobal('fetch', postMock);
    const posted = await makeStore().dispatch(
      tasksApi.endpoints.createTask.initiate({ title: 'T', description: 'D', priority: 'LOW', dueDate: '2030-01-01', assigneeId: 2 }),
    );
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(posted.error).toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
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
      vi.fn(async (request: Request) => (pathOf(request) === '/api/v1/auth/login' ? json(200, { user }) : json(200, emptyPage))),
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

  it('empties the api cache after the session ends', async () => {
    vi.stubGlobal('fetch', vi.fn(async (request: Request) => (pathOf(request) === '/api/v1/tasks' ? json(200, emptyPage) : json(401, errorBody('UNAUTHENTICATED')))));
    const store = makeStore();
    await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(Object.keys(store.getState().api.queries)).toHaveLength(1);

    store.dispatch(sessionEnded({ notify: false }));
    await new Promise((resolve) => setTimeout(resolve, 0)); // the wipe is deferred one tick
    expect(Object.keys(store.getState().api.queries)).toHaveLength(0);
  });

  it('does not abort a login submitted while the first-visit bootstrap is still failing', async () => {
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    let releaseRefresh: () => void = () => undefined;
    let releaseLogin: () => void = () => undefined;
    const refreshGate = new Promise<void>((resolve) => (releaseRefresh = resolve));
    const loginGate = new Promise<void>((resolve) => (releaseLogin = resolve));
    // A fetch that honours AbortSignal like a real one: a reset of the API state aborts in-flight requests.
    const abortable = (request: Request, gate: Promise<void>, respond: () => Response): Promise<Response> =>
      new Promise((resolve, reject) => {
        request.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        void gate.then(() => resolve(respond()));
      });
    vi.stubGlobal(
      'fetch',
      vi.fn((request: Request) => {
        const path = pathOf(request);
        if (path === '/api/v1/auth/me') return Promise.resolve(json(401, errorBody('UNAUTHENTICATED')));
        if (path === '/api/v1/auth/refresh') return abortable(request, refreshGate, () => json(401, errorBody('UNAUTHENTICATED')));
        if (path === '/api/v1/auth/login') return abortable(request, loginGate, () => json(200, { user }));
        return Promise.resolve(json(404, errorBody('NOT_FOUND', 404)));
      }),
    );

    const store = makeStore();
    const me = store.dispatch(authApi.endpoints.me.initiate(undefined));
    await new Promise((resolve) => setTimeout(resolve, 10)); // me answered 401; the refresh is now pending
    const login = store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));

    releaseRefresh(); // the first-visit refresh fails -> session end for a user who never had a session
    await me;
    await new Promise((resolve) => setTimeout(resolve, 10)); // let any deferred cache wipe run
    releaseLogin();

    const outcome = await login;
    expect('data' in outcome && outcome.data?.user.id).toBe(1);
    expect(store.getState().auth.status).toBe('authenticated');
  });

  it.each([
    ['503', () => json(503, '<html>down</html>'), 'NETWORK_ERROR'],
    ['429', () => json(429, errorBody('RATE_LIMITED', 429), { 'retry-after': '30' }), 'RATE_LIMITED'],
    ['network failure', () => Promise.reject(new TypeError('Failed to fetch')), 'NETWORK_ERROR'],
  ])('keeps the session when the refresh call fails with %s', async (_label, refreshResponse, code) => {
    const user = { id: 1, name: 'A', email: 'a@x.dev', role: { id: 1, code: 'ADMIN', name: 'Admin' } };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        const path = pathOf(request);
        if (path === '/api/v1/auth/login') return json(200, { user });
        if (path === '/api/v1/auth/refresh') return refreshResponse();
        return json(401, errorBody('TOKEN_EXPIRED'));
      }),
    );
    coldStartRetry.delaysMs = []; // a failing refresh is not retried here; only the outcome matters
    const store = makeStore();
    await store.dispatch(authApi.endpoints.login.initiate({ email: 'a@x.dev', password: 'pw' }));

    const result = await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));

    expect(store.getState().auth.status).toBe('authenticated');
    expect(result.error).toMatchObject({ code });
    expect((result.error as { handled?: boolean }).handled).toBeUndefined();
  });

  it('ends the session when the refresh call itself answers 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(401, errorBody('TOKEN_EXPIRED'))));
    const store = makeStore();
    const result = await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(store.getState().auth.status).toBe('unauthenticated');
    expect((result.error as { handled?: boolean }).handled).toBe(true);
  });

  it('keeps the waking notice up across a ~minute-long cold start, then clears it', async () => {
    vi.useFakeTimers();
    const { notify } = await import('@/lib/notify');
    coldStartRetry.delaysMs = [2000, 4000, 8000, 15000, 15000, 15000, 15000];
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++calls <= 7 ? json(503, '<html>wake</html>') : json(200, emptyPage))));

    const store = makeStore();
    const pending = store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    await vi.advanceTimersByTimeAsync(30000);
    expect(store.getState().ui.serverWaking).toBe(true);
    expect(notify.dismiss).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(60000);
    const result = await pending;
    expect(result.isSuccess).toBe(true);
    expect(store.getState().ui.serverWaking).toBe(false);
    expect(notify.dismiss).toHaveBeenCalledWith('server-waking');
  });

  it('stops waking-up retries once the backoff schedule is exhausted', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(503, '<html>down</html>')));
    const store = makeStore();
    const result = await store.dispatch(tasksApi.endpoints.listTasks.initiate({ page: 1, limit: 20 }));
    expect(result.isError).toBe(true);
    expect(store.getState().ui.serverWaking).toBe(false);
  });
});
