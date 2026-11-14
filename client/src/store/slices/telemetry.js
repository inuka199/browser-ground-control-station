/**
 * store/slices/telemetry.js
 * Authoritative vehicle telemetry state.
 *
 * Fields match the bridge.js wire format exactly.
 * All numeric values are in SI units as decoded by bridge.js:
 *   latitude / longitude : decimal degrees
 *   altitude             : metres above MSL
 *   relativeAltitude     : metres above home
 *   groundSpeed          : m/s
 *   batteryVoltage       : V
 *   batteryRemaining     : %  (0-100)
 *   roll / pitch / yaw   : degrees
 *   isArmed              : bool — decoded from HEARTBEAT base_mode bit 7
 */
import { create } from 'zustand';

/** @type {import('../../services/telemetryFreshness.js').TelemetryFreshness} */
const INITIAL = {
  latitude: null,
  longitude: null,
  altitude: null,
  relativeAltitude: null,
  groundSpeed: null,
  batteryVoltage: null,
  batteryRemaining: null,
  flightMode: null,
  roll: null,
  pitch: null,
  yaw: null,
  isArmed: null,      // null=unknown, false=disarmed, true=armed
  // Metadata added by the frontend on receipt
  receivedAt: null,   // performance.now() ms
  receivedIso: null,  // ISO string for display
};

export const useTelemetryStore = create((set) => ({
  data: { ...INITIAL },

  /**
   * Apply a raw telemetry payload from the WebSocket.
   * Only updates fields that are present in the payload.
   * @param {Partial<typeof INITIAL>} payload
   */
  applyUpdate: (payload) =>
    set((state) => ({
      data: {
        ...state.data,
        ...payload,
        receivedAt: performance.now(),
        receivedIso: new Date().toISOString(),
      },
    })),

  /** Reset all telemetry to null (e.g., on disconnect) */
  reset: () => set({ data: { ...INITIAL } }),
}));
