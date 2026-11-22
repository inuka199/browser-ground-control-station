/**
 * store/slices/environment.js
 * 3D environment configuration state.
 * Visual clock, atmosphere and quality settings, plus retained editor scaffolding.
 */
import { create } from 'zustand';
import { ENVIRONMENT_DEFAULTS, wrapHour, advanceTime } from '../../components/simulator/world/environmentMath.js';

export const useEnvironmentStore = create((set) => ({
  ...ENVIRONMENT_DEFAULTS,
  setTimeOfDay: (hour) => { if (Number.isFinite(hour)) set({ timeOfDay: wrapHour(hour) }); },
  setCycleEnabled: (cycleEnabled) => set({ cycleEnabled: Boolean(cycleEnabled) }),
  setCycleMinutes: (minutes) => { if (Number.isFinite(minutes)) set({ cycleMinutes: Math.min(60, Math.max(1, minutes)) }); },
  advanceClock: (delta) => set(s => s.cycleEnabled ? { timeOfDay: advanceTime(s.timeOfDay, delta, s.cycleMinutes) } : {}),
  setQuality: (quality) => { if (['low', 'balanced', 'high'].includes(quality)) set({ quality }); },
  setCityLife: (cityLife) => set({ cityLife: Boolean(cityLife) }),
  setWeatherMode: (weatherMode) => {
    if (['auto', 'clear', 'storm'].includes(weatherMode)) set({ weatherMode });
  },
  setHaze: (haze) => { if (Number.isFinite(haze)) set({ haze: Math.min(1, Math.max(0, haze)) }); },
  /** @type {Array<{id:string, type:string, position:{x:number,y:number,z:number}, rotation:{y:number}, scale:{x:number,y:number,z:number}}>} */
  obstacles: [],
  /** @type {Array<{id:string, position:{x:number,z:number}, heading:number, size:number, label:string}>} */
  landingPads: [],
  /** Wind configuration – visual only in Phase 1, wired to SITL in Phase 2 */
  wind: { speedMs: 0, directionDeg: 0, appliedToSitl: false },

  addObstacle: (obj) => set((s) => ({ obstacles: [...s.obstacles, obj] })),
  removeObstacle: (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),
  updateObstacle: (id, patch) =>
    set((s) => ({ obstacles: s.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),

  addLandingPad: (pad) => set((s) => ({ landingPads: [...s.landingPads, pad] })),
  removeLandingPad: (id) => set((s) => ({ landingPads: s.landingPads.filter((p) => p.id !== id) })),

  setWind: (patch) => set((s) => ({ wind: { ...s.wind, ...patch } })),
  resetEnvironment: () => set({ obstacles: [], landingPads: [], wind: { speedMs: 0, directionDeg: 0, appliedToSitl: false } }),
}));
