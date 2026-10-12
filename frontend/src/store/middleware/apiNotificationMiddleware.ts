import { isFulfilled, isRejectedWithValue, Middleware, UnknownAction } from '@reduxjs/toolkit';
import { successMessageFor } from '@/lib/apiMessages';
import { notificationFor } from '@/lib/apiNotification';
import { notify } from '@/lib/notify';
import { authApi } from '@/services/api/authApi';
import { baseApi } from '@/services/api/baseApi';
import { ApiError } from '@/types/api';
import { sessionEnded } from '../actions';

interface EndpointMeta {
  endpointName: string;
  type: 'query' | 'mutation';
  originalArgs: unknown;
}

/** RTK Query thunk actions carry the endpoint they belong to in meta.arg; anything else is ignored. */
function endpointMetaOf(action: UnknownAction): EndpointMeta | null {
  const meta = (action as { meta?: { arg?: Partial<EndpointMeta> } }).meta;
  const arg = meta?.arg;
  if (!arg || typeof arg.endpointName !== 'string' || (arg.type !== 'query' && arg.type !== 'mutation')) return null;
  return { endpointName: arg.endpointName, type: arg.type, originalArgs: arg.originalArgs };
}

/**
 * The one place that turns API outcomes into toasts and session side effects, so components never call `notify`
 * for API results:
 *  - every mutation success → success toast (message from apiMessages)
 *  - every API error → toast at the level chosen by notificationFor
 *  - session end → info toast (if the user was signed in) and a wiped query cache
 *  - sign-in → wiped query cache, so one user can never see another user's cached data
 */
export const apiNotificationMiddleware: Middleware = (store) => (next) => (action) => {
  const result = next(action);
  const unknownAction = action as UnknownAction;

  if (sessionEnded.match(unknownAction)) {
    if (unknownAction.payload.notify) notify.info('Your session has expired. Please sign in again.', { id: 'session-expired' });
    // Deferred a tick: this action is dispatched from inside the failing request, and wiping the cache synchronously
    // would discard that request's own rejection (its caller would see an uninitialized result instead of the error).
    if (unknownAction.payload.wipeCache !== false) setTimeout(() => store.dispatch(baseApi.util.resetApiState()), 0);
    return result;
  }

  if (authApi.endpoints.login.matchFulfilled(unknownAction)) {
    store.dispatch(baseApi.util.resetApiState());
  }

  const meta = endpointMetaOf(unknownAction);
  if (!meta) return result;

  if (isFulfilled(unknownAction) && meta.type === 'mutation') {
    const message = successMessageFor(meta.endpointName, meta.originalArgs);
    if (message) notify.success(message);
  }

  if (isRejectedWithValue(unknownAction)) {
    const spec = notificationFor(unknownAction.payload as ApiError);
    if (spec) notify[spec.level](spec.message);
  }

  return result;
};
