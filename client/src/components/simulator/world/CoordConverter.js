/**
 * simulator/world/CoordConverter.js
 *
 * Converts GPS coordinates (WGS-84 decimal degrees) to the local
 * Three.js East-North-Up (ENU) frame centred on the Colombo Port City origin.
 *
 * Coordinate mapping:
 *   East  → +X
 *   Up    → +Y
 *   North → -Z  (Three.js convention: camera looks down -Z)
 */

/** Colombo Port City waterfront origin */
export const ORIGIN_LAT = 6.9271;
export const ORIGIN_LON = 79.8430;

const R_EARTH = 6_371_000; // metres
const DEG2RAD = Math.PI / 180;

/**
 * Convert GPS (lat, lon, relativeAltitude) to local Three.js Vector3.
 * @param {number} lat
 * @param {number} lon
 * @param {number} relAlt  — metres above home
 * @returns {{ x: number, y: number, z: number }|null} null for invalid coordinates
 */
export function gpsToLocal(lat, lon, relAlt) {
  if (![lat, lon, relAlt].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const dLat = (lat - ORIGIN_LAT) * DEG2RAD;
  const dLon = (lon - ORIGIN_LON) * DEG2RAD;
  const cosLat = Math.cos(ORIGIN_LAT * DEG2RAD);
  const local = {
    x:  dLon * cosLat * R_EARTH,  // East  → +X
    y:  relAlt,                   // Up    → +Y
    z: -dLat * R_EARTH,           // North → -Z
  };
  return Object.values(local).every(Number.isFinite) ? local : null;
}

/**
 * Flat-earth distance between two GPS points (metres).
 */
export function gpsDistance(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * DEG2RAD;
  const dLon = (lon2 - lon1) * DEG2RAD;
  const cosLat = Math.cos(((lat1 + lat2) / 2) * DEG2RAD);
  const dx = dLon * cosLat * R_EARTH;
  const dy = dLat * R_EARTH;
  return Math.sqrt(dx * dx + dy * dy);
}
