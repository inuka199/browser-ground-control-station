/**
 * store/slices/simulation.js
 * SITL session lifecycle state.
 *
 * Phase 1: status is derived from WebSocket/telemetry health only.
 * Phase 2: will include backend-controlled session management.
 *
 * States: UNKNOWN | STOPPED | STARTING | RUNNING | PAUSED | STOPPING | ERROR
 */
import { create } from 'zustand';

export const useSimulationStore = create((set) => ({
  /** @type {'UNKNOWN'|'STOPPED'|'STARTING'|'RUNNING'|'PAUSED'|'STOPPING'|'ERROR'} */
  sessionState: 'UNKNOWN',
  sessionId: null,
  startedAt: null,
  lastError: null,
  /** Diagnostic message counts forwarded from bridge */
  messageCounts: {},

  setSessionState: (sessionState) => set({ sessionState }),
  setStarted: (sessionId) =>
    set({ sessionState: 'RUNNING', sessionId, startedAt: new Date().toISOString(), lastError: null }),
  setError: (err) => set({ sessionState: 'ERROR', lastError: err }),
  setMessageCounts: (counts) => set({ messageCounts: counts }),
  reset: () =>
    set({ sessionState: 'UNKNOWN', sessionId: null, startedAt: null, lastError: null, messageCounts: {} }),
}));
