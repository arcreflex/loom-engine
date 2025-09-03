import '@testing-library/jest-dom/vitest';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { server } from './testServer';
import { useAppStore } from '../state';

// MSW: error on any unhandled request to catch missing handlers
server.events.on('request:unhandled', ({ request }) => {
  console.error('Unhandled request:', request.method, request.url);
});

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

// Fail tests on any console.error/warn to keep tests strict
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    originalError(...args);
    throw new Error('console.error in test');
  };
  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    throw new Error('console.warn in test');
  };
});

afterAll(() => {
  console.error = originalError;
  console.warn = originalWarn;
});

// Reset Zustand store between tests while preserving bound action functions
const initialStoreState = useAppStore.getState();
beforeEach(() => {
  // Replace state to initial values but keep the current actions reference,
  // using functional setState to avoid casts.
  useAppStore.setState(
    state => ({ ...state, ...initialStoreState, actions: state.actions }),
    true
  );
});

// JSDOM doesn't implement scrollIntoView; stub it for components that call it
beforeAll(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: vi.fn(),
    configurable: true
  });
  class RO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { [k: string]: unknown }).ResizeObserver = RO;
});
