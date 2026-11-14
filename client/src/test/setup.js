/**
 * src/test/setup.js
 * Vitest global test setup.
 * - Imports jest-dom matchers for DOM assertions.
 * - Stubs browser APIs that jsdom does not implement.
 */
import '@testing-library/jest-dom';

// Pure physics and scene tests do not need a complete DOM. Provide the small
// persistence surface their shared stores use, keeping each worker isolated.
if (typeof window === 'undefined') {
  const items = new Map();
  global.localStorage = {
    getItem: key => items.get(key) ?? null,
    setItem: (key,value) => items.set(key,String(value)),
    removeItem: key => items.delete(key),
    clear: () => items.clear(),
  };
}

// performance.now() is available in jsdom but not always wired up.
// Ensure it exists so telemetryFreshness.js can call it in tests.
if (typeof performance === 'undefined') {
  global.performance = { now: () => Date.now() };
}

// WebSocket stub — prevents "WebSocket is not defined" in store/service tests.
// Tests that need a real WS stub should supply their own mock.
if (typeof WebSocket === 'undefined') {
  global.WebSocket = class MockWebSocket {
    constructor() { this.readyState = 0; }
    send() {}
    close() {}
  };
  global.WebSocket.OPEN = 1;
}
