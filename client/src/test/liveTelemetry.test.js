// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hasLivePosition } from '../components/simulator/flightDynamics.js';
import { gpsToLocal, ORIGIN_LAT, ORIGIN_LON } from '../components/simulator/world/CoordConverter.js';
import { useTelemetryStore } from '../store/slices/telemetry.js';

const now = 10_000;
const wallNow = 1_800_000_000_000;
const frame = () => ({
  latitude: ORIGIN_LAT, longitude: ORIGIN_LON, altitude: 35, relativeAltitude: 25,
  roll: 5, pitch: -3, yaw: 90,
});
const required = ['latitude', 'longitude', 'altitude', 'relativeAltitude', 'roll', 'pitch', 'yaw'];

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(now);
  vi.spyOn(Date, 'now').mockReturnValue(wallNow);
  useTelemetryStore.getState().reset();
});
afterEach(() => vi.restoreAllMocks());

describe('complete live telemetry frames', () => {
  it.each(required)('rejects missing, non-numeric and non-finite %s', field => {
    for (const value of [undefined, null, NaN, Infinity, -Infinity, '12', {}]) {
      const data = { ...frame(), [field]: value, receivedAt: now };
      expect(hasLivePosition(data, true, now)).toBe(false);
      expect(useTelemetryStore.getState().applyUpdate(data)).toBe(false);
      expect(useTelemetryStore.getState().data.receivedAt).toBeNull();
    }
    const missing = frame();
    delete missing[field];
    expect(useTelemetryStore.getState().applyUpdate(missing)).toBe(false);
  });

  it.each([null, undefined, [], {}, 'telemetry', 4])('rejects malformed payload %j', payload => {
    expect(hasLivePosition(payload, true, now)).toBe(false);
    expect(useTelemetryStore.getState().applyUpdate(payload)).toBe(false);
  });

  it.each([null, undefined, NaN, Infinity, '10000', -1, now + 1, now - 5000])(
    'rejects invalid or stale receipt timestamp %s without restamping it', receivedAt => {
      const data = { ...frame(), receivedAt };
      expect(hasLivePosition(data, true, now)).toBe(false);
      expect(useTelemetryStore.getState().applyUpdate(data)).toBe(false);
    },
  );

  it.each([null, NaN, Infinity, '1800000000000', wallNow + 1, wallNow - 5000])(
    'rejects invalid or stale source timestamp %s even on a new arrival', timestamp => {
      expect(useTelemetryStore.getState().applyUpdate({ ...frame(), timestamp })).toBe(false);
    },
  );

  it('expires at five seconds and requires a connection and a finite clock', () => {
    const data = { ...frame(), receivedAt: now };
    expect(hasLivePosition(data, true, now + 4999)).toBe(true);
    expect(hasLivePosition(data, true, now + 5000)).toBe(false);
    expect(hasLivePosition(data, false, now)).toBe(false);
    expect(hasLivePosition(data, true, NaN)).toBe(false);
    expect(hasLivePosition(data, true, Infinity)).toBe(false);
    expect(hasLivePosition(data, true, now - 1)).toBe(false);
  });

  it('does not keep stale source data alive with repeated complete broadcasts', () => {
    const data = { ...frame(), timestamp: wallNow - 4999 };
    expect(useTelemetryStore.getState().applyUpdate(data)).toBe(true);
    expect(hasLivePosition(useTelemetryStore.getState().data, true, now)).toBe(true);
    vi.mocked(Date.now).mockReturnValue(wallNow + 1);
    expect(hasLivePosition(useTelemetryStore.getState().data, true, now + 1)).toBe(false);
    expect(useTelemetryStore.getState().applyUpdate(data)).toBe(false);
  });

  it('invalidates live flight on a partial update instead of merging old fields', () => {
    const store = useTelemetryStore.getState();
    expect(store.applyUpdate(frame())).toBe(true);
    expect(store.applyUpdate({ relativeAltitude: 30 })).toBe(false);
    expect(hasLivePosition(useTelemetryStore.getState().data, true, now)).toBe(false);
    expect(store.applyUpdate({ roll: 0, pitch: 0, yaw: 0 })).toBe(false);
    expect(store.applyUpdate(frame())).toBe(true);
    expect(hasLivePosition(useTelemetryStore.getState().data, true, now)).toBe(true);
  });

  it('preserves valid live values and accepts zero-valued fields', () => {
    const payload = { ...frame(), timestamp: wallNow, groundSpeed: 8, batteryRemaining: null };
    expect(useTelemetryStore.getState().applyUpdate(payload)).toBe(true);
    const data = useTelemetryStore.getState().data;
    expect(data).toMatchObject({ ...payload, receivedAt: now });
    expect(hasLivePosition(data, true, now)).toBe(true);
    expect(gpsToLocal(data.latitude, data.longitude, data.relativeAltitude)).toEqual({ x: 0, y: 25, z: -0 });
    expect(hasLivePosition({ ...Object.fromEntries(required.map(field => [field, 0])), receivedAt: 0 }, true, 0)).toBe(true);
  });

  it.each([{ latitude: 91 }, { longitude: -181 }, { groundSpeed: Infinity }, { batteryVoltage: '12' }])(
    'rejects malformed coordinates or optional numeric values %j', patch => {
      expect(useTelemetryStore.getState().applyUpdate({ ...frame(), ...patch })).toBe(false);
    },
  );
});

describe('GPS conversion boundary', () => {
  it.each([
    [NaN, ORIGIN_LON, 25], [ORIGIN_LAT, NaN, 25],
    [ORIGIN_LAT, ORIGIN_LON, Infinity], [ORIGIN_LAT, ORIGIN_LON, -Infinity],
    [ORIGIN_LAT, ORIGIN_LON, NaN], [ORIGIN_LAT, ORIGIN_LON],
    [null, ORIGIN_LON, 25], [ORIGIN_LAT, undefined, 25],
    [ORIGIN_LAT, ORIGIN_LON, null], ['6.9271', ORIGIN_LON, 25],
    [91, ORIGIN_LON, 25], [ORIGIN_LAT, -181, 25], [Number.MAX_VALUE, Number.MAX_VALUE, 25],
  ])('returns no position for invalid inputs %j', (...args) => {
    expect(gpsToLocal(...args)).toBeNull();
  });

  it('preserves valid east/north/up conversion and below-home altitudes', () => {
    const local = gpsToLocal(ORIGIN_LAT + 0.001, ORIGIN_LON + 0.001, -2);
    expect(local.x).toBeCloseTo(110.3833, 3);
    expect(local.z).toBeCloseTo(-111.1949, 3);
    expect(local.y).toBe(-2);
    expect(Object.values(local).every(Number.isFinite)).toBe(true);
  });
});
