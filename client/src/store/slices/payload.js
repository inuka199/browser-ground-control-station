import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const usePayloadStore = create(persist(set => ({
  fov: 60, tilt: 0, rangefinder: false,
  setFov: fov => { if (Number.isFinite(fov)) set({ fov: Math.max(35, Math.min(100, fov)) }); },
  setTilt: tilt => { if (Number.isFinite(tilt)) set({ tilt: Math.max(-30, Math.min(85, tilt)) }); },
  setRangefinder: rangefinder => set({ rangefinder: Boolean(rangefinder) }),
  reset: () => set({ fov: 60, tilt: 0, rangefinder: false }),
}), { name: 'nexus-payload', partialize: ({ fov, tilt, rangefinder }) => ({ fov, tilt, rangefinder }) }));
