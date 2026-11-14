/**
 * store/index.js
 * Zustand store root — imports and re-exports all slices.
 * Import individual slices directly for selector performance.
 */
export { useConnectionStore } from './slices/connection.js';
export { useTelemetryStore } from './slices/telemetry.js';
export { useVehicleStore } from './slices/vehicles.js';
export { useCommandStore } from './slices/commands.js';
export { useSimulationStore } from './slices/simulation.js';
export { useRecordingStore } from './slices/recording.js';
export { useEnvironmentStore } from './slices/environment.js';
export { useChallengeStore } from './slices/challenges.js';
export { useTrainingStore } from './slices/training.js';
