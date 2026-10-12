import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { baseApi } from '@/services/api/baseApi';
import { apiNotificationMiddleware } from './middleware/apiNotificationMiddleware';
import authReducer from './slices/authSlice';
import uiReducer from './slices/uiSlice';
import '@/services/api/tasksApi';
import '@/services/api/commentsApi';
import '@/services/api/usersApi';
import '@/services/api/dashboardApi';

const rootReducer = combineReducers({
  [baseApi.reducerPath]: baseApi.reducer,
  auth: authReducer,
  ui: uiReducer,
});

export type RootState = ReturnType<typeof rootReducer>;

const createStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware, apiNotificationMiddleware),
  });

// The store type comes from this private builder and makeStore is annotated with it, so AppStore/AppDispatch never
// depend on makeStore's own inferred return type (the usual source of circular-type errors).
export type AppStore = ReturnType<typeof createStore>;
export type AppDispatch = AppStore['dispatch'];

/** A factory, not a singleton: with the App Router each server render must get its own store so state never leaks between requests. */
export const makeStore = (): AppStore => createStore();
