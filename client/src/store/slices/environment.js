/**
 * store/slices/environment.js
 * 3D environment configuration state.
 * Visual clock, atmosphere and quality settings, plus retained editor scaffolding.
 */
import { create } from 'zustand';
import { ENVIRONMENT_DEFAULTS, wrapHour, advanceTime } from '../../components/simulator/world/environmentMath.js';

import { readPreference, wantsTouchFlight, writePreference } from '../../components/simulator/mobileFlight.js';

const preferenceKey = 'nexus-world-settings-v1';
function savedSettings() {
  let saved;
  try { saved = JSON.parse(readPreference(preferenceKey)) || {}; } catch { saved = {}; }
  const settings = {};
  for (const [key, min, max] of [['timeOfDay', 0, 24], ['cycleMinutes', 1, 60], ['haze', 0, 1]]) {
    if (Number.isFinite(saved[key])) settings[key] = Math.min(max, Math.max(min, saved[key]));
  }
  for (const key of ['cycleEnabled', 'cityLife']) {
    if (typeof saved[key] === 'boolean') settings[key] = saved[key];
  }
  if (['auto', 'clear', 'storm'].includes(saved.weatherMode)) settings.weatherMode = saved.weatherMode;
  if (Number.isFinite(saved.wind?.speedMs) && Number.isFinite(saved.wind?.directionDeg)) {
    settings.wind = { speedMs: Math.min(18, Math.max(0, saved.wind.speedMs)),
      directionDeg: (saved.wind.directionDeg % 360 + 360) % 360, appliedToSitl: false };
  }
  settings.quality = ['low', 'balanced', 'high'].includes(saved.quality) ? saved.quality :
    wantsTouchFlight() ? 'low' : ENVIRONMENT_DEFAULTS.quality;
  return settings;
}
export const useEnvironmentStore = create((set, get) => {
  const configure = patch => {
    set(patch);
    const { timeOfDay, cycleMinutes, haze, cycleEnabled, cityLife, weatherMode, wind, quality } = get();
    writePreference(preferenceKey, JSON.stringify({ timeOfDay, cycleMinutes, haze, cycleEnabled, cityLife, weatherMode, wind, quality }));
  };
  return {
    ...ENVIRONMENT_DEFAULTS,
    ...savedSettings(),
    setTimeOfDay: (hour) => { if (Number.isFinite(hour)) configure({ timeOfDay: wrapHour(hour) }); },
    setCycleEnabled: (cycleEnabled) => configure({ cycleEnabled: Boolean(cycleEnabled) }),
    setCycleMinutes: (minutes) => { if (Number.isFinite(minutes)) configure({ cycleMinutes: Math.min(60, Math.max(1, minutes)) }); },
    advanceClock: (delta) => set(s => s.cycleEnabled ? { timeOfDay: advanceTime(s.timeOfDay, delta, s.cycleMinutes) } : {}),
    setQuality: (quality) => { if (['low', 'balanced', 'high'].includes(quality)) configure({ quality }); },
    setCityLife: (cityLife) => configure({ cityLife: Boolean(cityLife) }),
    setWeatherMode: (weatherMode) => {
      if (['auto', 'clear', 'storm'].includes(weatherMode)) configure({ weatherMode });
    },
    setHaze: (haze) => { if (Number.isFinite(haze)) configure({ haze: Math.min(1, Math.max(0, haze)) }); },
    /** @type {Array<{id:string, type:string, position:{x:number,y:number,z:number}, rotation:{y:number}, scale:{x:number,y:number,z:number}}>} */
    obstacles: [],
    /** @type {Array<{id:string, position:{x:number,z:number}, heading:number, size:number, label:string}>} */
    landingPads: [],

    addObstacle: (obj) => set((s) => ({ obstacles: [...s.obstacles, obj] })),
    removeObstacle: (id) => set((s) => ({ obstacles: s.obstacles.filter((o) => o.id !== id) })),
    updateObstacle: (id, patch) =>
      set((s) => ({ obstacles: s.obstacles.map((o) => (o.id === id ? { ...o, ...patch } : o)) })),

    addLandingPad: (pad) => set((s) => ({ landingPads: [...s.landingPads, pad] })),
    removeLandingPad: (id) => set((s) => ({ landingPads: s.landingPads.filter((p) => p.id !== id) })),

    setWind: ({ speedMs, directionDeg }) => configure(({ wind }) => ({
      wind: {
        speedMs: Number.isFinite(speedMs) ? Math.min(18, Math.max(0, speedMs)) : wind.speedMs,
        directionDeg: Number.isFinite(directionDeg) ? ((directionDeg % 360) + 360) % 360 : wind.directionDeg,
        appliedToSitl: false,
      },
    })),
    resetEnvironment: () => configure({ obstacles: [], landingPads: [], wind: ENVIRONMENT_DEFAULTS.wind }),
  };
});
