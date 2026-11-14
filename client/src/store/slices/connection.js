/**
 * store/slices/connection.js
 * WebSocket connection state.
 * Source of truth: ws.onopen / ws.onclose / ws.onerror in websocket.js service.
 */
import { create } from 'zustand';

/**
 * @typedef {'disconnected'|'connecting'|'connected'|'reconnecting'} ConnectionStatus
 */

export const useConnectionStore = create((set) => ({
  /** @type {ConnectionStatus} */
  status: 'disconnected',
  /** ISO timestamp of last successful connection */
  connectedAt: null,
  /** Number of times the WS has reconnected in this session */
  reconnectCount: 0,
  /** Last error message, if any */
  lastError: null,

  setStatus: (status) =>
    set((state) => ({
      status,
      connectedAt: status === 'connected' ? new Date().toISOString() : state.connectedAt,
      reconnectCount:
        status === 'connected' && state.status === 'reconnecting'
          ? state.reconnectCount + 1
          : state.reconnectCount,
    })),

  setError: (msg) => set({ lastError: msg }),
  clearError: () => set({ lastError: null }),
}));
