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
import { isFreshPosition, isFreshTelemetry } from '../../services/telemetryValidation.js';

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
  positionData: null,

  /**
   * Apply a raw telemetry payload from the WebSocket.
   * Accept complete, finite, fresh frames atomically. Rejected frames disable live flight.
   * Keep a separately validated position for Route Replay, which needs no attitude.
   * @param {object} payload
   * @returns {boolean} whether the frame was accepted
   */
  applyUpdate: (payload) => {
    const now = performance.now();
    const receivedAt = payload != null && Object.hasOwn(payload, 'receivedAt')
      ? payload.receivedAt : now;
    const frame = { ...payload, receivedAt };
    const positionData = !Array.isArray(payload) && isFreshPosition(frame, now) ? {
      latitude: frame.latitude, longitude: frame.longitude, relativeAltitude: frame.relativeAltitude,
      receivedAt,
      positionTimestamp: Object.hasOwn(frame, 'positionTimestamp') ? frame.positionTimestamp : frame.timestamp ?? Date.now(),
      systemId: Number.isInteger(frame.systemId) ? frame.systemId : null,
    } : null;
    if (Array.isArray(payload) || !isFreshTelemetry(frame, now)) {
      set({ data: { ...INITIAL }, positionData });
      return false;
    }
    set({ data: { ...INITIAL, ...payload, receivedAt, receivedIso: new Date().toISOString() }, positionData });
    return true;
  },

  /** Reset all telemetry to null (e.g., on disconnect) */
  reset: () => set({ data: { ...INITIAL }, positionData: null }),
}));
