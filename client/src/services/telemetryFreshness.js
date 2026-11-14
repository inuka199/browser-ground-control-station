/**
 * services/telemetryFreshness.js
 * Computes a qualitative freshness state for a telemetry field or the overall
 * telemetry stream, based on the age of the last received message.
 *
 * Thresholds (configurable):
 *   HEALTHY    < 3 s since last update
 *   DELAYED    3–8 s
 *   STALE      8–30 s
 *   DISCONNECTED > 30 s
 *   UNKNOWN    receivedAt is null
 *
 * Usage:
 *   import { getTelemetryFreshness } from '../services/telemetryFreshness.js';
 *   const freshness = getTelemetryFreshness(receivedAt); // receivedAt = performance.now()
 */

/** @typedef {'HEALTHY'|'DELAYED'|'STALE'|'DISCONNECTED'|'UNKNOWN'} FreshnessState */

const THRESHOLDS_MS = {
  HEALTHY: 3_000,
  DELAYED: 8_000,
  STALE: 30_000,
};

/**
 * @param {number|null} receivedAt - performance.now() timestamp of last telemetry
 * @returns {FreshnessState}
 */
export function getTelemetryFreshness(receivedAt) {
  if (receivedAt == null) return 'UNKNOWN';
  const ageMs = performance.now() - receivedAt;
  if (ageMs < THRESHOLDS_MS.HEALTHY) return 'HEALTHY';
  if (ageMs < THRESHOLDS_MS.DELAYED) return 'DELAYED';
  if (ageMs < THRESHOLDS_MS.STALE) return 'STALE';
  return 'DISCONNECTED';
}

/** Human-readable label for each freshness state */
export const FRESHNESS_LABELS = {
  HEALTHY: 'Healthy',
  DELAYED: 'Delayed',
  STALE: 'Stale',
  DISCONNECTED: 'Disconnected',
  UNKNOWN: 'Unknown',
};

/** CSS variable names / class suffixes for each state */
export const FRESHNESS_COLOR = {
  HEALTHY: 'var(--accent-green)',
  DELAYED: 'var(--accent-yellow)',
  STALE: 'var(--accent-red)',
  DISCONNECTED: 'var(--accent-red)',
  UNKNOWN: 'var(--text-muted)',
};
