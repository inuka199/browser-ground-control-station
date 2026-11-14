/**
 * services/websocket.js
 * Singleton WebSocket manager.
 *
 * Responsibilities:
 *  - Opens and maintains one WS connection to the bridge.
 *  - Auto-reconnects with exponential backoff (max 16 s).
 *  - Routes incoming messages to the correct Zustand store actions.
 *  - Provides a send() helper for outgoing commands.
 *  - Does NOT open a second connection if called multiple times.
 *
 * Routing logic:
 *  - If data.type === 'COMMAND_STATUS'  → useCommandStore
 *  - Otherwise (plain telemetry object) → useTelemetryStore + useVehicleStore
 *
 * This replaces the inline WebSocket logic in the old App.jsx.
 * Call initWebSocket() once at app startup (in main.jsx or App.jsx).
 * Call sendCommand(payload) from any component without accessing wsRef directly.
 */

import { useConnectionStore } from '../store/slices/connection.js';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useCommandStore } from '../store/slices/commands.js';
import { useVehicleStore } from '../store/slices/vehicles.js';

// Hosted demos run without a bridge unless an endpoint is configured.
const WS_URL = import.meta.env.VITE_WS_URL ||
  (['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname) ? 'ws://localhost:8080' : null);
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;

let ws = null;
let reconnectTimer = null;
let backoffMs = BASE_BACKOFF_MS;
let destroyed = false;

function scheduleReconnect() {
  if (destroyed) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    connect();
  }, backoffMs);
  backoffMs = Math.min(backoffMs * 2, MAX_BACKOFF_MS);
}

function connect() {
  if (destroyed) return;
  if (ws && [WebSocket.CONNECTING, WebSocket.OPEN].includes(ws.readyState)) return;
  const { setStatus, setError } = useConnectionStore.getState();

  const currentStatus = useConnectionStore.getState().status;
  setStatus(currentStatus === 'disconnected' && !useConnectionStore.getState().connectedAt ? 'connecting' : 'reconnecting');

  try { ws = new WebSocket(WS_URL); }
  catch {
    setStatus('disconnected');
    setError('The bridge address is invalid or unavailable. Check VITE_WS_URL. Offline flight remains available.');
    scheduleReconnect();
    return;
  }

  ws.onopen = () => {
    backoffMs = BASE_BACKOFF_MS; // reset on success
    useConnectionStore.getState().setStatus('connected');
    useConnectionStore.getState().clearError();
  };

  ws.onmessage = (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      console.warn('[WS] Received non-JSON message');
      return;
    }

    if (!data || typeof data !== 'object') return;

    // Route COMMAND_STATUS responses
    if (data.type === 'COMMAND_STATUS') {
      const { setPending, setSuccess, setError: setCmdErr } = useCommandStore.getState();
      const identifier = data.label || data.mode || data.command || 'command';
      if (data.status === 'SUBMITTED') {
        setPending(identifier, data.message || `${identifier} submitted. Awaiting confirmation…`);
      } else if (data.status === 'CONFIRMED') {
        setSuccess(data.message || `${identifier} confirmed.`, identifier);
      } else if (['REJECTED', 'FAILED', 'TIMEOUT'].includes(data.status)) {
        setCmdErr(data.message || `${identifier} failed (${data.status}).`);
      }
      return;
    }

    // Route live telemetry
    useTelemetryStore.getState().applyUpdate(data);

    // Detect confirmed mode via telemetry heartbeat (legacy behaviour preserved)
    if (data.flightMode) {
      const { state: cmdState, targetMode, setSuccess } = useCommandStore.getState();
      if (cmdState === 'pending' && targetMode === data.flightMode) {
        setSuccess(`Flight mode confirmed: ${data.flightMode}`);
      }
    }

    // Mark vehicle as live
    useVehicleStore.getState().updateVehicle('sitl-1', {
      connectionState: 'connected',
      lastSeenIso: new Date().toISOString(),
    });
  };

  ws.onclose = () => {
    useConnectionStore.getState().setStatus('disconnected');
    useTelemetryStore.getState().reset();
    if (useCommandStore.getState().state === 'pending') useCommandStore.getState().setError('Connection lost before the command was confirmed.');
    useVehicleStore.getState().updateVehicle('sitl-1', { connectionState: 'disconnected' });
    scheduleReconnect();
  };

  ws.onerror = () => {
    setError('Bridge unavailable. Start the bridge to use live telemetry. Offline flight remains available.');
  };
}

/** Start the WebSocket manager. Call once at app bootstrap. */
export function initWebSocket() {
  destroyed = false;
  if (!WS_URL) {
    useConnectionStore.getState().setStatus('disconnected');
    useConnectionStore.getState().setError('No bridge address is configured for this site. Offline flight remains available.');
    return;
  }
  connect();
}

export function retryConnection() {
  destroyWebSocket();
  useTelemetryStore.getState().reset();
  useConnectionStore.getState().setStatus('disconnected');
  if (useCommandStore.getState().state === 'pending') useCommandStore.getState().setError('Connection restarted before the command was confirmed.');
  backoffMs = BASE_BACKOFF_MS;
  initWebSocket();
}

/** Tear down the connection (e.g., during testing or hot-reload). */
export function destroyWebSocket() {
  destroyed = true;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  if (ws) {
    ws.onclose = null; // prevent reconnect loop
    ws.onopen = ws.onmessage = ws.onerror = null;
    ws.close();
    ws = null;
  }
}

/**
 * Send a structured command payload to the bridge.
 * @param {object} payload - must include at minimum { type: string }
 * @returns {boolean} true if sent, false if WS is not open
 */
export function sendCommand(payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) { useCommandStore.getState().setError('Bridge is offline. No command was sent.'); return false; }
  try {
    const label = payload.label || payload.mode || payload.type;
    useCommandStore.getState().setPending(label, 'Sending ' + label + '…');
    ws.send(JSON.stringify(payload));
    return true;
  } catch (err) {
    console.error('[WS] Send failed:', err);
    useCommandStore.getState().setError('Command could not be sent. Check the bridge connection.');
    return false;
  }
}

/** Get the current raw WebSocket instance (use sparingly). */
export function getWs() {
  return ws;
}
