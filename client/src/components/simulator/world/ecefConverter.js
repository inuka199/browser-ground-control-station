/**
 * simulator/world/ecefConverter.js
 *
 * Converts WGS-84 (lat, lon, altitude-MSL) to ECEF (Earth-Centred Earth-Fixed)
 * Cartesian coordinates in metres — the native coordinate space used by
 * the Google Photorealistic 3D Tiles dataset.
 *
 * ECEF convention:
 *   +X → prime meridian / equator intersection (off the coast of West Africa)
 *   +Y → 90° East / equator
 *   +Z → North Pole
 *
 * For Three.js we keep the same ECEF convention; the tiles renderer places
 * the globe in this space and we position the drone in the same space.
 *
 * References:
 *   WGS-84 ellipsoid:  a = 6378137.0 m,  f = 1/298.257223563
 *   b = a(1-f),  e² = 1 - (b/a)²
 */

const WGS84_A = 6_378_137.0;            // semi-major axis (m)
const WGS84_F = 1 / 298.257_223_563;   // flattening
const WGS84_B = WGS84_A * (1 - WGS84_F); // semi-minor axis
const WGS84_E2 = 1 - (WGS84_B / WGS84_A) ** 2; // first eccentricity squared

/** Colombo Port City reference in ECEF — pre-computed for performance. */
export const COLOMBO_LAT =  6.9271;   // degrees
export const COLOMBO_LON = 79.8430;   // degrees
export const COLOMBO_ALT =  0.0;      // metres MSL (sea level)

const DEG2RAD = Math.PI / 180;

/**
 * Convert WGS-84 geodetic coordinates to ECEF Cartesian coordinates.
 *
 * @param {number} latDeg  — Latitude in decimal degrees (positive = North)
 * @param {number} lonDeg  — Longitude in decimal degrees (positive = East)
 * @param {number} altM    — Altitude above WGS-84 ellipsoid in metres
 * @returns {{ x: number, y: number, z: number }} ECEF position in metres
 */
export function wgs84ToEcef(latDeg, lonDeg, altM = 0) {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const sinLat = Math.sin(lat);
  const cosLat = Math.cos(lat);
  const sinLon = Math.sin(lon);
  const cosLon = Math.cos(lon);

  // Prime vertical radius of curvature
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * sinLat * sinLat);

  return {
    x: (N + altM) * cosLat * cosLon,
    y: (N + altM) * cosLat * sinLon,
    z: (N * (1 - WGS84_E2) + altM) * sinLat,
  };
}

/**
 * Pre-computed ECEF position of the Colombo Port City origin.
 * Used to build the local-to-ECEF transform for the drone.
 */
export const COLOMBO_ECEF = wgs84ToEcef(COLOMBO_LAT, COLOMBO_LON, COLOMBO_ALT);

/**
 * Convert telemetry (lat, lon, relativeAlt) to ECEF,
 * falling back to the Colombo origin when no GPS is available.
 *
 * relativeAlt is above the home point (approximately MSL for SITL).
 *
 * @param {number|null} lat
 * @param {number|null} lon
 * @param {number} relAlt — metres above home
 * @returns {{ x: number, y: number, z: number }}
 */
export function telemetryToEcef(lat, lon, relAlt = 0) {
  return wgs84ToEcef(
    lat  ?? COLOMBO_LAT,
    lon  ?? COLOMBO_LON,
    COLOMBO_ALT + (relAlt ?? 0),
  );
}
