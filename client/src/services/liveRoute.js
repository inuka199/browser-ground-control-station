import { isFreshPosition } from './telemetryValidation.js';

export const LIVE_ROUTE_MAX_POINTS = 2000;
const METRES_PER_DEGREE = Math.PI * 6371000 / 180;

// Each continuous live session gets its own local origin, anywhere in the world.
// Never write these samples into the saved/demo replay path.
export function createLiveRouteTracker() {
  let origin = null, points = [], previousSample = null, revision = 0;
  return {
    update(data, now = performance.now(), wallNow = Date.now()) {
      if (!isFreshPosition(data, now, wallNow)) {
        origin = null; points = []; previousSample = null;
        return null;
      }
      if (!origin || origin.systemId !== data.systemId) {
        origin = { ...data }; points = []; previousSample = null;
      }
      // Wrap longitude at the date line instead of drawing across the world.
      const longitudeDelta = ((data.longitude - origin.longitude + 540) % 360) - 180;
      const position = {
        x: longitudeDelta * Math.cos(origin.latitude * Math.PI / 180) * METRES_PER_DEGREE,
        y: data.relativeAltitude,
        z: -(data.latitude - origin.latitude) * METRES_PER_DEGREE,
      };
      const sample = data.positionTimestamp ?? data.timestamp ?? data.receivedAt;
      if (sample !== previousSample) {
        const last = points.at(-1);
        if (!last || position.x !== last.x || position.y !== last.y || position.z !== last.z) {
          points.push(position);
          if (points.length > LIVE_ROUTE_MAX_POINTS) points.shift();
          revision++;
        }
        previousSample = sample;
      }
      return { position, points, revision };
    },
  };
}
