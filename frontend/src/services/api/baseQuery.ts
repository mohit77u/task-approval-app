import { BaseQueryApi, BaseQueryFn, FetchArgs, fetchBaseQuery, FetchBaseQueryError, FetchBaseQueryMeta } from '@reduxjs/toolkit/query';
import { notify } from '@/lib/notify';
import { normalizeError } from '@/lib/normalizeError';
import { sessionEnded } from '@/store/actions';
import { setServerWaking } from '@/store/slices/uiSlice';
import { ApiError } from '@/types/api';

const rawBaseQuery = fetchBaseQuery({ baseUrl: '/api/v1', credentials: 'include' });

type RawResult = Awaited<ReturnType<typeof rawBaseQuery>>;

const AUTH_ENDPOINTS = ['auth/login', 'auth/refresh', 'auth/logout'];
const GATEWAY_STATUSES = [502, 503, 504];

/**
 * Backoff between attempts when the (free, sleeping) backend is waking up; a cold start takes about a minute, so the
 * delays add up to ~74s. Mutable so tests can make it instant.
 */
export const coldStartRetry = { delaysMs: [2000, 4000, 8000, 15000, 15000, 15000, 15000] };

const WAKING_TOAST_ID = 'server-waking';
/** Requests currently retrying against a sleeping backend; the banner stays up until the last one settles. */
let wakingRequests = 0;

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
  let counted = false;

  try {
    for (let attempt = 0; attempt < coldStartRetry.delaysMs.length; attempt += 1) {
      if (!isGet(args) || !isColdStartFailure(result.error) || api.signal.aborted) break;
      if (!counted) {
        counted = true;
        wakingRequests += 1;
        api.dispatch(setServerWaking(true));
        // Infinity: the notice stays until the request settles, whatever the cold start takes.
        notify.info('Waking up the server, this can take up to a minute…', { id: WAKING_TOAST_ID, duration: Infinity });
      }
      await sleep(coldStartRetry.delaysMs[attempt]);
      result = await rawBaseQuery(args, api, extraOptions);
    }
  } finally {
    if (counted) {
      wakingRequests -= 1;
      if (wakingRequests === 0) {
        api.dispatch(setServerWaking(false));
        notify.dismiss(WAKING_TOAST_ID);
      }
    }
  }

  return result;
}

/** Shared across store instances, which is fine in the browser (one store); only tests create several. */
let refreshInFlight: Promise<RawResult> | null = null;

/**
 * Many requests can expire at the same moment. They all share one refresh call: a second concurrent refresh would
 * present an already-rotated token and look like token theft to the backend.
 */
function refreshOnce(api: BaseQueryApi, extraOptions: object): Promise<RawResult> {
  if (!refreshInFlight) {
    refreshInFlight = requestWithColdStartRetry({ url: 'auth/refresh', method: 'POST' }, api, extraOptions).finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

/** Only a definite "no" from the server ends the session; a network blip, 5xx or 429 says nothing about the cookie. */
const isSessionRejected = (error: FetchBaseQueryError | undefined): boolean =>
  error?.status === 401 || error?.status === 403;

interface AuthAwareState {
  auth?: { status?: string; user?: unknown };
}

const authOf = (api: BaseQueryApi): NonNullable<AuthAwareState['auth']> => (api.getState() as AuthAwareState).auth ?? {};

export const baseQuery: BaseQueryFn<string | FetchArgs, unknown, ApiError, object, FetchBaseQueryMeta> = async (
  args,
  api,
  extraOptions,
) => {
  // Who was signed in when this request left. A login that completes while the request or its refresh is in flight
  // makes any "session rejected" answer stale: it describes the cookies from before that login.
  const userAtStart = authOf(api).user;
  let result = await requestWithColdStartRetry(args, api, extraOptions);

  if (isAuthFailure(result.error) && !isAuthEndpoint(args)) {
    const refresh = await refreshOnce(api, extraOptions);
    if (!refresh.error) {
      result = await requestWithColdStartRetry(args, api, extraOptions);
    } else if (!isSessionRejected(refresh.error)) {
      // Transient refresh failure: keep the session and surface the real problem so the usual error toast applies.
      return { error: normalizeError(refresh.error, refresh.meta?.response?.headers.get('retry-after')), meta: refresh.meta };
    } else {
      const auth = authOf(api);
      const wasSignedIn = auth.status === 'authenticated';
      if (wasSignedIn && auth.user !== userAtStart) {
        // A first-visit refresh (no cookie, backend answers 401 and clears cookies) landed after the user logged in.
        // Ending the session now would log them straight out; the error is still reported as handled (no toast).
        return { error: { ...normalizeError(result.error), handled: true }, meta: result.meta };
      }
      api.dispatch(sessionEnded({ notify: wasSignedIn, wipeCache: wasSignedIn }));
      return { error: { ...normalizeError(result.error), handled: true }, meta: result.meta };
    }
  }

  if (result.error) {
    return { error: normalizeError(result.error, result.meta?.response?.headers.get('retry-after')), meta: result.meta };
  }
  return { data: result.data, meta: result.meta };
};
