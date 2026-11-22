// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createLiveRouteTracker, LIVE_ROUTE_MAX_POINTS } from '../services/liveRoute.js';
import { isFreshPosition } from '../services/telemetryValidation.js';
import { useTelemetryStore } from '../store/slices/telemetry.js';

const wall = 1800000000000;
const frame = { latitude: 51.5, longitude: -0.1, relativeAltitude: 20, receivedAt: 10000, positionTimestamp: wall };
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(10000);
  vi.spyOn(Date, 'now').mockReturnValue(wall);
  useTelemetryStore.getState().reset();
});
afterEach(() => vi.restoreAllMocks());

it('tracks GPS independently of missing attitude without enabling simulator flight', () => {
  expect(useTelemetryStore.getState().applyUpdate({ ...frame, timestamp: null })).toBe(false);
  const store = useTelemetryStore.getState();
  expect(store.data.receivedAt).toBeNull();
  expect(isFreshPosition(store.positionData, 10000)).toBe(true);
  store.reset();
  expect(useTelemetryStore.getState().positionData).toBeNull();
});

it('uses the first fix as origin anywhere on Earth and follows later movement in metres', () => {
  const tracker = createLiveRouteTracker();
  expect(tracker.update(frame).position).toEqual({ x: 0, y: 20, z: -0 });
  const next = tracker.update({ ...frame, latitude: 51.501, longitude: -0.099, relativeAltitude: 30, positionTimestamp: wall + 100 }, 10100, wall + 100);
  expect(next.position.x).toBeCloseTo(69.22, 1);
  expect(next.position.z).toBeCloseTo(-111.195, 2);
  expect(next.position.y).toBe(30);
  expect(next.points).toHaveLength(2);
});

it.each([
  null, {}, { ...frame, latitude: 91 }, { ...frame, longitude: Infinity },
  { ...frame, relativeAltitude: '20' }, { ...frame, gpsFixType: 2 },
  { ...frame, receivedAt: 5000 }, { ...frame, positionTimestamp: null },
  { ...frame, positionTimestamp: wall - 5000 }, { ...frame, positionTimestamp: wall + 1 },
])('falls back for invalid, stale, or missing positions: %j', data => {
  const tracker = createLiveRouteTracker();
  tracker.update(frame);
  expect(tracker.update(data)).toBeNull();
  const reconnect = tracker.update({ ...frame, latitude: -33.8, longitude: 151.2 });
  expect(reconnect.points).toHaveLength(1);
  expect(reconnect.position.x).toBe(0);
});

it('expires even without new packets and never refreshes GPS from a heartbeat timestamp', () => {
  const tracker = createLiveRouteTracker();
  tracker.update(frame);
  expect(tracker.update({ ...frame, receivedAt: 15000, timestamp: wall + 5000 }, 15000, wall + 5000)).toBeNull();
});

it('wraps the date line and resets the origin when the vehicle changes', () => {
  const tracker = createLiveRouteTracker();
  tracker.update({ ...frame, latitude: 0, longitude: 179.999, systemId: 1 });
  const next = tracker.update({ ...frame, latitude: 0, longitude: -179.999, systemId: 1 });
  expect(next.position.x).toBeCloseTo(222.39, 1);
  expect(tracker.update({ ...frame, systemId: 2 }).position.x).toBe(0);
});

it('bounds trail memory and does not duplicate repeated bridge snapshots', () => {
  const tracker = createLiveRouteTracker();
  let result;
  for (let i = 0; i < LIVE_ROUTE_MAX_POINTS + 30; i++) {
    result = tracker.update({ ...frame, latitude: frame.latitude + i / 1000000, positionTimestamp: wall + i }, 10000 + i, wall + i);
  }
  expect(result.points).toHaveLength(LIVE_ROUTE_MAX_POINTS);
  const revision = result.revision;
  result = tracker.update({ ...frame, latitude: frame.latitude + (LIVE_ROUTE_MAX_POINTS + 29) / 1000000, positionTimestamp: wall + LIVE_ROUTE_MAX_POINTS + 29 }, 10000 + LIVE_ROUTE_MAX_POINTS + 29, wall + LIVE_ROUTE_MAX_POINTS + 29);
  expect(result.revision).toBe(revision);
});
