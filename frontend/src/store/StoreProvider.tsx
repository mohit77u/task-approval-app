'use client';

import { setupListeners } from '@reduxjs/toolkit/query';
import { ReactNode, useEffect, useState } from 'react';
import { Provider } from 'react-redux';
import { makeStore } from './index';

export function StoreProvider({ children }: { children: ReactNode }): React.JSX.Element {
  // Lazy initialiser: one store per mounted provider, created once (a ref read during render trips the React lint rules).
  const [store] = useState(makeStore);

  // Enables refetchOnFocus / refetchOnReconnect.
  useEffect(() => setupListeners(store.dispatch), [store]);

  return <Provider store={store}>{children}</Provider>;
}
