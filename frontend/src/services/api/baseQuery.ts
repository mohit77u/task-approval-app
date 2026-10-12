import { BaseQueryApi, BaseQueryFn, FetchArgs, fetchBaseQuery, FetchBaseQueryError, FetchBaseQueryMeta } from '@reduxjs/toolkit/query';
import { notify } from '@/lib/notify';
import { normalizeError } from '@/lib/normalizeError';
import { sessionEnded } from '@/store/actions';
import { setServerWaking } from '@/store/slices/uiSlice';
import { ApiError } from '@/types/api';

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api', credentials: 'include' });

type RawResult = Awaited<ReturnType<typeof rawBaseQuery>>;

const AUTH_ENDPOINTS = ['auth/login', 'auth/refresh', 'auth/logout'];
const GATEWAY_STATUSES = [502, 503, 504];

/** Backoff between attempts when the (free, sleeping) backend is waking up. Mutable so tests can make it instant. */
export const coldStartRetry = { delaysMs: [1000, 2000, 4000] };

const urlOf = (args: string | FetchArgs): string => (typeof args === 'string' ? args : args.url);
const isGet = (args: string | FetchArgs): boolean => typeof args === 'string' || !args.method || args.method.toUpperCase() === 'GET';
const isAuthEndpoint = (args: string | FetchArgs): boolean => AUTH_ENDPOINTS.some((endpoint) => urlOf(args).startsWith(endpoint));
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function isColdStartFailure(error: FetchBaseQueryError | undefined): boolean {
  if (!error) return false;
  if (error.status === 'FETCH_ERROR') return true;
  if (typeof error.status === 'number') return GATEWAY_STATUSES.includes(error.status);
  return error.status === 'PARSING_ERROR' && GATEWAY_STATUSES.includes(error.originalStatus);
}

function isAuthFailure(error: FetchBaseQueryError | undefined): boolean {
  if (!error || error.status !== 401) return false;
  const code = (error.data as { code?: string } | undefined)?.code;
  return code === 'TOKEN_EXPIRED' || code === 'UNAUTHENTICATED';
}

/**
 * Runs a request and, for GETs only, retries when the backend looks asleep. Retrying a write after a lost response could
 * duplicate it (two tasks created), so mutations are never auto-retried.
 */
async function requestWithColdStartRetry(
  args: string | FetchArgs,
  api: BaseQueryApi,
  extraOptions: object,
): Promise<RawResult> {
  let result = await rawBaseQuery(args, api, extraOptions);

  for (let attempt = 0; attempt < coldStartRetry.delaysMs.length; attempt += 1) {
    if (!isGet(args) || !isColdStartFailure(result.error) || api.signal.aborted) break;
    if (attempt === 0) {
      api.dispatch(setServerWaking(true));
      notify.info('Waking up the server, this can take up to a minute…', { id: 'server-waking', duration: 15000 });
    }
    await sleep(coldStartRetry.delaysMs[attempt]);
    result = await rawBaseQuery(args, api, extraOptions);
  }

  if (!result.error || !isColdStartFailure(result.error)) api.dispatch(setServerWaking(false));
  return result;
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Many requests can expire at the same moment. They all share one refresh call: a second concurrent refresh would
 * present an already-rotated token and look like token theft to the backend.
 */
function refreshOnce(api: BaseQueryApi, extraOptions: object): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = requestWithColdStartRetry({ url: 'auth/refresh', method: 'POST' }, api, extraOptions)
      .then((result) => !result.error)
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

interface AuthAwareState {
  auth?: { status?: string };
}

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError, object, FetchBaseQueryMeta> = async (
  args,
  api,
  extraOptions,
) => {
  let result = await requestWithColdStartRetry(args, api, extraOptions);

  if (isAuthFailure(result.error) && !isAuthEndpoint(args)) {
    if (await refreshOnce(api, extraOptions)) {
      result = await requestWithColdStartRetry(args, api, extraOptions);
    } else {
      const wasSignedIn = (api.getState() as AuthAwareState).auth?.status === 'authenticated';
      api.dispatch(sessionEnded({ notify: wasSignedIn }));
      return { error: { ...normalizeError(result.error), handled: true }, meta: result.meta };
    }
  }

  if (result.error) {
    return { error: normalizeError(result.error, result.meta?.response?.headers.get('retry-after')), meta: result.meta };
  }
  return { data: result.data, meta: result.meta };
};
