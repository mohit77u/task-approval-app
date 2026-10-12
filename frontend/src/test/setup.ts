import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';

// Node's Request rejects relative URLs, but RTK Query builds Requests for '/api/v1/...'. Resolve them against a fake origin
// so tests can exercise the real fetchBaseQuery.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(typeof input === 'string' && input.startsWith('/') ? `http://localhost${input}` : input, init);
  }
} as typeof Request;

// Vitest globals are off, so Testing Library's automatic cleanup is not registered; unmount between tests ourselves.
afterEach(() => cleanup());
