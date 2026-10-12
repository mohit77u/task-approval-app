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

/** A factory, not a singleton: with the App Router each server render must get its own store so state never leaks between requests. */
export const makeStore = () =>
  configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware, apiNotificationMiddleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = AppStore['dispatch'];
