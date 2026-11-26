export const touchFlightQuery = '(pointer: coarse), (any-pointer: coarse) and (max-width: 1100px)';

export function wantsTouchFlight() {
  return globalThis.matchMedia?.(touchFlightQuery)?.matches ?? false;
}

export function readPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function writePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
}

const checkpointKey = 'nexus-offline-flight-v1';

export function saveFlightPosition(flight, launchPoint) {
  writePreference(checkpointKey, JSON.stringify({ flight, launchPoint }));
}

export function readFlightPosition() {
  try {
    const { flight, launchPoint } = JSON.parse(readPreference(checkpointKey));
    if (!['port-city', 'galle-face'].includes(launchPoint)) return null;
    if (![flight.x, flight.y, flight.z, flight.yaw].every(Number.isFinite) ||
        flight.y < 0 || typeof flight.grounded !== 'boolean') return null;
    return { flight, launchPoint };
  } catch { return null; }
}

export function clearFlightPosition() {
  try { localStorage.removeItem(checkpointKey); } catch { /* Session only. */ }
}
