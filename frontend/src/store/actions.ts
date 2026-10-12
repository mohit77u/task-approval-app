import { createAction } from '@reduxjs/toolkit';

/**
 * Dispatched whenever the session is over (refresh failed, or the user logged out). Lives in its own file so both the
 * API layer and the slices can import it without a circular dependency.
 * `notify` is true only if the user was signed in, so a first visit does not greet them with "session expired".
 */
export const sessionEnded = createAction<{ notify: boolean; wipeCache?: boolean }>('auth/sessionEnded');
// `wipeCache` (default true) is false for a first visit with no session: there is nothing to wipe, and resetting the API
// state would abort a login the user submitted while the bootstrap /auth/me + refresh was still in flight.
