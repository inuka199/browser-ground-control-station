// Simulator inputs must come from one complete frame, never merged fragments.
export const LIVE_TELEMETRY_MAX_AGE_MS = 5000;

const REQUIRED_FIELDS = [
  'latitude', 'longitude', 'altitude', 'relativeAltitude', 'roll', 'pitch', 'yaw',
];
const OPTIONAL_NUMERIC_FIELDS = ['groundSpeed', 'batteryVoltage', 'batteryRemaining'];

export function hasValidPositionFields(data) {
  return data != null && typeof data === 'object' && !Array.isArray(data) &&
    ['latitude', 'longitude', 'relativeAltitude'].every(field => Number.isFinite(data[field])) &&
    Math.abs(data.latitude) <= 90 && Math.abs(data.longitude) <= 180 &&
    Math.abs(data.relativeAltitude) <= 100000 &&
    (data.gpsFixType == null || (Number.isInteger(data.gpsFixType) && data.gpsFixType >= 3 && data.gpsFixType <= 8));
}

export function hasValidTelemetryFields(data) {
  return data != null && typeof data === 'object' && !Array.isArray(data) &&
    REQUIRED_FIELDS.every(field => Number.isFinite(data[field])) &&
    hasValidPositionFields(data) &&
    (data.flightMode == null || (typeof data.flightMode === 'string' && data.flightMode.length <= 40)) &&
    (data.isArmed == null || typeof data.isArmed === 'boolean') &&
    OPTIONAL_NUMERIC_FIELDS.every(field => data[field] == null || Number.isFinite(data[field]));
}

function isFreshTimestamp(timestamp, now) {
  return Number.isFinite(timestamp) && Number.isFinite(now) && timestamp >= 0 &&
    now - timestamp >= 0 && now - timestamp < LIVE_TELEMETRY_MAX_AGE_MS;
}

// Position tracking needs a valid GPS/height sample, not a complete attitude frame.
// The bridge timestamps position separately so a heartbeat cannot revive old GPS.
export function isFreshPosition(data, now, wallNow = Date.now()) {
  if (!hasValidPositionFields(data) || !isFreshTimestamp(data.receivedAt, now)) return false;
  if (Object.hasOwn(data, 'positionTimestamp')) return isFreshTimestamp(data.positionTimestamp, wallNow);
  return !Object.hasOwn(data, 'timestamp') || isFreshTimestamp(data.timestamp, wallNow);
}

export function isFreshTelemetry(data, now, wallNow = Date.now()) {
  return hasValidTelemetryFields(data) && isFreshPosition(data, now, wallNow) &&
    // Legacy bridges have no source timestamp; their complete frames use receipt time.
    // Current bridges timestamp the oldest required MAVLink sample, not the broadcast.
    (!Object.hasOwn(data, 'timestamp') || isFreshTimestamp(data.timestamp, wallNow));
}
