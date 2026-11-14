/**
 * store/slices/simulator.js
 * Simulator-specific state — separate from telemetry, simulation, and environment.
 *
 * Camera modes:
 *   'chase' — smooth follow-behind camera (default)
 *   'fpv'   — first-person view from drone nose
 *   'top'   — overhead orthographic-style look-down
 *   'side'  — lateral profile view
 *   'free'  — orbit controls, user can pan/zoom freely
 */
import { create } from 'zustand';
import { useRecordingStore } from './recording.js';
import { validatePath } from '../../services/flightRecords.js';

const INITIAL_STATS = {
  startTime:  null,
  distance:   0,        // cumulative horizontal distance in metres
  peakAlt:    0,        // peak relative altitude in metres
  lastPos:    null,     // { lat, lon } of last telemetry sample
};

const R_EARTH = 6_371_000; // metres
const RECORDING_KEY = 'nexus-flight-recording';
const MODEL_IDS = ['compact-quad', 'racing-quad', 'hexacopter'];
const CAMERA_IDS = ['chase','fpv','top','side','free'];
function savedCamera() {
  try { const mode=localStorage.getItem('nexus-camera');return CAMERA_IDS.includes(mode) ? mode : 'chase'; }
  catch { return 'chase'; }
}
function savedModel() {
  try { const id = localStorage.getItem('nexus-aircraft'); return MODEL_IDS.includes(id) ? id : MODEL_IDS[0]; }
  catch { return MODEL_IDS[0]; }
}
function savedRoute() {
  try { const value = JSON.parse(sessionStorage.getItem(RECORDING_KEY) || '{}'); return { label: value.label || 'Recorded flight', source: ['demo', 'live', 'plan'].includes(value.source) ? value.source : 'demo' }; }
  catch { return { label: 'Recorded flight', source: 'demo' }; }
}
function savedPath() {
  try {
    const path = JSON.parse(sessionStorage.getItem(RECORDING_KEY) || '[]');
    return validatePath(Array.isArray(path) ? path : path.points);
  } catch { return []; }
}

export const useSimulatorStore = create((set, get) => ({
  /** Active camera mode */
  cameraMode:    savedCamera(),
  demoData: { flightMode: 'DEMO', relativeAltitude: 0, groundSpeed: 0, yaw: 0, roll: 0, pitch: 0 },
  setDemoData: (demoData) => set({ demoData }),
  flownPath: savedPath(),
  routeLabel: savedRoute().label,
  recordingSource: savedRoute().source,
  isRecording: false,
  startRecording: () => {
    try { sessionStorage.removeItem(RECORDING_KEY); } catch { /* storage unavailable */ }
    set({ flownPath: [], isRecording: true, recordingSource: null, routeLabel: 'Recorded flight' });
  },
  stopRecording: () => set((s) => {
    if (s.isRecording && s.flownPath.length > 1) useRecordingStore.getState().saveFlight(s.flownPath, s.droneModelId, s.recordingSource || 'demo');
    try { sessionStorage.setItem(RECORDING_KEY, JSON.stringify({ points: s.flownPath, label: s.routeLabel, source: s.recordingSource })); } catch { /* storage unavailable */ }
    return { isRecording: false };
  }),
  recordPosition: (position) => set((s) => {
    if (!s.isRecording) return s;
    if (![position.x, position.y, position.z].every(Number.isFinite)) return s;
    const source = position.source === 'live' ? 'live' : 'demo';
    if (s.recordingSource && s.recordingSource !== source) {
      if (s.flownPath.length > 1) useRecordingStore.getState().saveFlight(s.flownPath, s.droneModelId, s.recordingSource);
      try { sessionStorage.setItem(RECORDING_KEY, JSON.stringify({ points: s.flownPath, label: s.routeLabel, source: s.recordingSource })); } catch { /* storage unavailable */ }
      return { isRecording: false };
    }
    return { recordingSource: source, flownPath: [...s.flownPath.slice(-9999), { x: position.x, y: position.y, z: position.z, t: Date.now() }] };
  }),
  loadFlownPath: (points, label = 'Recorded flight', source = 'demo') => {
    const path = validatePath(points);
    set({ flownPath: path, isRecording: false, routeLabel: label, recordingSource: source });
    try { sessionStorage.setItem(RECORDING_KEY, JSON.stringify({ points: path, label, source })); } catch { /* Session replay remains available. */ }
  },
  clearFlownPath: () => {
    try { sessionStorage.removeItem(RECORDING_KEY); } catch { /* storage unavailable */ }
    set({ flownPath: [], isRecording: false, routeLabel: 'Recorded flight', recordingSource: null });
  },
  /** Currently selected drone model id */
  droneModelId: savedModel(),
  /** Whether the simulator renderer is paused */
  isPaused:      false,
  /** Whether the drone is on the ground (not airborne) */
  isGrounded:    true,
  isDestroyed: false,
  restartSerial: 0,
  destructionReason: '',
  detonationSerial: 0,
  detonateDemo: () => set(s=>({detonationSerial:s.detonationSerial+1})),
  setDestroyed: (isDestroyed, destructionReason = '') => set({isDestroyed,destructionReason}),
  launchPoint: 'galle-face',
  setLaunchPoint: launchPoint => { if (['galle-face','port-city'].includes(launchPoint)) set({launchPoint}); },
  restartDemo: () => set(s=>({restartSerial:s.restartSerial+1,isDestroyed:false,isPaused:false,destructionReason:''})),
  buildingDistance: Infinity,
  rangefinderDistance: null,
  setRangefinderDistance: rangefinderDistance => set({ rangefinderDistance }),
  setBuildingDistance: (distance) => set({ buildingDistance: distance }),
  /** Whether the HUD overlay is visible */
  isHudVisible:  true,
  /** Whether the on-screen control guide is shown */
  isGuideVisible: false,
  /** In-flight stats — null startTime means no active flight */
  flightStats:   { ...INITIAL_STATS },

  // ── Google 3D Tiles ──────────────────────────────────────────────────────
  /**
   * Whether the Google Photorealistic 3D Tiles world is active.
   * When false, the procedural Colombo world is shown instead.
   */
  tilesEnabled: false,
  /**
   * Current loading state of the tiles renderer:
   *   'no-key'  — VITE_GOOGLE_MAPS_API_KEY not set (not a user error)
   *   'loading' — root tileset is being fetched
   *   'ready'   — tiles loaded successfully
   *   'error'   — network or auth failure
   *   'idle'    — tiles are disabled (procedural world active)
   */
  tilesStatus: 'idle',
  /** Attribution text extracted from tiles — must be displayed when tiles visible */
  tilesAttribution: '© Google',

  // ── actions ──────────────────────────────────────────────────────

  setCameraMode: (mode) => {
    if(!CAMERA_IDS.includes(mode)) return;
    try {localStorage.setItem('nexus-camera',mode);} catch { /* Session preference remains available. */ }
    set({cameraMode:mode});
  },
  setDroneModelId: (id) => {
    if (!MODEL_IDS.includes(id)) return;
    try { localStorage.setItem('nexus-aircraft', id); } catch { /* Selection still works for this session. */ }
    set({ droneModelId: id });
  },
  setPaused:         (v)    => set({ isPaused: v }),
  togglePaused:      ()     => set((s) => ({ isPaused: !s.isPaused })),
  setGrounded:       (v)    => set({ isGrounded: v }),
  setHudVisible:     (v)    => set({ isHudVisible: v }),
  toggleHud:         ()     => set((s) => ({ isHudVisible: !s.isHudVisible })),
  toggleGuide:       ()     => set((s) => ({ isGuideVisible: !s.isGuideVisible })),

  /** Enable/disable the Google 3D Tiles world (switching also resets status). */
  setTilesEnabled:   (v)    => set({ tilesEnabled: v, tilesStatus: v ? 'loading' : 'idle' }),
  toggleTiles:       ()     => set((s) => ({
    tilesEnabled: !s.tilesEnabled,
    tilesStatus:  !s.tilesEnabled ? 'loading' : 'idle',
  })),
  /** Called by TilesWorld when status changes. */
  setTilesStatus:    (s)    => set({ tilesStatus: s }),
  /** Called by TilesWorld with extracted attribution text. */
  setTilesAttribution: (t)  => set({ tilesAttribution: t }),

  /** Call when a new flight begins (SITL arms / takeoff). */
  startFlight: () =>
    set({ flightStats: { ...INITIAL_STATS, startTime: Date.now() } }),

  /**
   * Update cumulative flight stats from a fresh telemetry sample.
   * @param {number|null} lat
   * @param {number|null} lon
   * @param {number|null} relativeAlt
   */
  updateFlightStats: (lat, lon, relativeAlt) => {
    if (lat == null || lon == null) return;
    const { flightStats } = get();
    const { lastPos, distance, peakAlt } = flightStats;

    let added = 0;
    if (lastPos) {
      const dLat = (lat - lastPos.lat) * (Math.PI / 180);
      const dLon = (lon - lastPos.lon) * (Math.PI / 180);
      const cosLat = Math.cos(lat * (Math.PI / 180));
      const dx = dLon * cosLat * R_EARTH;
      const dy = dLat * R_EARTH;
      added = Math.sqrt(dx * dx + dy * dy);
    }

    set({
      flightStats: {
        ...flightStats,
        distance:  distance + added,
        peakAlt:   Math.max(peakAlt, relativeAlt ?? 0),
        lastPos:   { lat, lon },
      },
    });
  },

  /** Reset stats without clearing start time — call on location jump. */
  resetFlightStats: () =>
    set((s) => ({ flightStats: { ...INITIAL_STATS, startTime: s.flightStats.startTime } })),

  /** End the flight and keep the final stats for the summary modal. */
  endFlight: () =>
    set((s) => ({
      flightStats: { ...s.flightStats, endTime: Date.now() },
    })),
}));
