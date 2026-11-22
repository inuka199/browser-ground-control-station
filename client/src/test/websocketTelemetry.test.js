import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useConnectionStore } from '../store/slices/connection.js';
import { useVehicleStore } from '../store/slices/vehicles.js';
import { useCommandStore } from '../store/slices/commands.js';
import { hasLivePosition } from '../components/simulator/flightDynamics.js';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useTelemetryHealth } from '../services/useTelemetryHealth.js';

const frame = {
  latitude: 6.9271, longitude: 79.843, altitude: 35, relativeAltitude: 25,
  roll: 5, pitch: -3, yaw: 90, flightMode: 'GUIDED',
};
let websocket;
let socket;

beforeAll(async () => {
  vi.stubEnv('VITE_WS_URL', 'ws://localhost:8080');
  websocket = await import('../services/websocket.js');
});
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(10_000);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.stubGlobal('WebSocket', class {
    static CONNECTING = 0;
    static OPEN = 1;
    readyState = 1;
    close() {}
  });
  useTelemetryStore.getState().reset();
  useCommandStore.getState().reset();
  useConnectionStore.setState({ status: 'disconnected', connectedAt: null });
  useVehicleStore.getState().updateVehicle('sitl-1', { connectionState: 'unknown', lastSeenIso: null });
  websocket.initWebSocket();
  socket = websocket.getWs();
  socket.onopen();
});
afterEach(() => {
  cleanup();
  websocket.destroyWebSocket();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const receive = data => socket.onmessage({ data: JSON.stringify(data) });
const isLive = () => hasLivePosition(useTelemetryStore.getState().data, useConnectionStore.getState().status === 'connected', performance.now());

describe('WebSocket live flight routing', () => {
  it('expires live controls and simulator flight together when source samples get stale', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const wallNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(wallNow);
    receive({ ...frame, timestamp: wallNow - 4999 });
    const { result } = renderHook(() => useTelemetryHealth());
    expect(result.current.fresh).toBe(true);
    expect(isLive()).toBe(true);
    vi.mocked(Date.now).mockReturnValue(wallNow + 1);
    vi.mocked(performance.now).mockReturnValue(10_001);
    act(() => vi.advanceTimersByTime(500));
    expect(result.current.fresh).toBe(false);
    expect(isLive()).toBe(false);
  });

  it.each([
    { ...frame, latitude: NaN }, { ...frame, longitude: NaN },
    { ...frame, altitude: Infinity }, { ...frame, relativeAltitude: Infinity },
    { ...frame, roll: null }, { ...frame, pitch: Infinity }, { ...frame, yaw: '90' },
    { ...frame, receivedAt: 5000 }, { ...frame, relativeAltitude: undefined },
    { flightMode: 'GUIDED' }, null, [], 42,
  ])('rejects %j before marking telemetry live or confirming a command', data => {
    useCommandStore.getState().setPending('GUIDED', 'Waiting');
    receive(data);
    expect(isLive()).toBe(false);
    expect(useTelemetryStore.getState().data.receivedAt).toBeNull();
    expect(useVehicleStore.getState().vehicles['sitl-1'].lastSeenIso).toBeNull();
    expect(useCommandStore.getState().state).toBe('pending');
  });

  it('switches live → fallback → live and expires without another message', () => {
    receive(frame);
    expect(isLive()).toBe(true);
    expect(useTelemetryStore.getState().data).toMatchObject(frame);
    receive({ latitude: frame.latitude, longitude: frame.longitude });
    expect(isLive()).toBe(false);
    receive(frame);
    expect(isLive()).toBe(true);
    vi.mocked(performance.now).mockReturnValue(15_000);
    expect(isLive()).toBe(false);
  });

  it('falls back on malformed JSON and numeric overflow in valid JSON', () => {
    for (const raw of ['{bad json', '{"latitude":NaN}', JSON.stringify(frame).replace('"relativeAltitude":25', '"relativeAltitude":1e400')]) {
      receive(frame);
      expect(isLive()).toBe(true);
      expect(() => socket.onmessage({ data: raw })).not.toThrow();
      expect(isLive()).toBe(false);
    }
  });

  it('keeps valid telemetry flight and command-status routing working', () => {
    useCommandStore.getState().setPending('GUIDED', 'Waiting');
    receive(frame);
    expect(useCommandStore.getState().state).toBe('success');
    expect(useVehicleStore.getState().vehicles['sitl-1'].connectionState).toBe('connected');
    const accepted = useTelemetryStore.getState().data;
    useCommandStore.getState().setPending('ARM', 'Waiting');
    receive({ type: 'COMMAND_STATUS', status: 'CONFIRMED', label: 'ARM', message: 'Armed' });
    expect(useCommandStore.getState().state).toBe('success');
    expect(useTelemetryStore.getState().data).toBe(accepted);
    expect(isLive()).toBe(true);
  });

  it('keeps position-only telemetry available for routes and clears it on transport errors', () => {
    receive({ latitude: 51.5, longitude: -0.1, relativeAltitude: 12, positionTimestamp: Date.now(), timestamp: null });
    expect(useTelemetryStore.getState().positionData).toMatchObject({ latitude: 51.5, relativeAltitude: 12 });
    expect(isLive()).toBe(false);
    socket.onerror();
    expect(useTelemetryStore.getState().positionData).toBeNull();
    expect(useConnectionStore.getState().status).toBe('disconnected');
  });

  it('ignores malformed command replies and does not expose objects as UI text', () => {
    useCommandStore.getState().setPending('GUIDED', 'Waiting');
    receive({ type: 'COMMAND_STATUS', status: 'CONFIRMED', message: { bad: true } });
    expect(useCommandStore.getState().state).toBe('pending');
    receive({ ...frame, flightMode: { bad: true } });
    expect(useTelemetryStore.getState().data.flightMode).toBeNull();
  });
});
