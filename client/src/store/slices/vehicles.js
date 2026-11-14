/**
 * store/slices/vehicles.js
 * Vehicle registry. Phase 1: single-vehicle only.
 * Phase 6 will expand to multi-vehicle by adding to the record map.
 */
import { create } from 'zustand';

/**
 * @typedef {Object} VehicleRecord
 * @property {string}  id             - Stable vehicle identifier (e.g. 'sitl-1')
 * @property {string}  displayName
 * @property {'connected'|'disconnected'|'unknown'} connectionState
 * @property {number|null} systemId   - MAVLink system ID when known
 * @property {string}  vehicleType    - e.g. 'ArduCopter'
 * @property {string|null} lastSeenIso
 */

const SITL_PRIMARY = {
  id: 'sitl-1',
  displayName: 'SITL Primary',
  connectionState: 'unknown',
  systemId: null,
  vehicleType: 'ArduCopter',
  lastSeenIso: null,
};

export const useVehicleStore = create((set) => ({
  /** @type {Record<string, VehicleRecord>} */
  vehicles: { 'sitl-1': { ...SITL_PRIMARY } },

  /** ID of the vehicle the user has focused on */
  selectedId: 'sitl-1',

  updateVehicle: (id, patch) =>
    set((state) => ({
      vehicles: {
        ...state.vehicles,
        [id]: { ...state.vehicles[id], ...patch },
      },
    })),

  setSelected: (id) => set({ selectedId: id }),
}));
