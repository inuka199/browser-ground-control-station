import React, { useEffect } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import DashboardView from '../components/views/DashboardView.jsx';
import SimulatorPage from '../components/simulator/SimulatorPage.jsx';
import { prepareFlightLaunch } from '../components/simulator/flightLaunch.js';
import { hasLivePosition } from '../components/simulator/flightDynamics.js';
import { useSimulatorStore } from '../store/slices/simulator.js';
import { useChallengeStore } from '../store/slices/challenges.js';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useConnectionStore } from '../store/slices/connection.js';
import { useCommandStore } from '../store/slices/commands.js';
import { sendCommand } from '../services/websocket.js';

const observed = vi.hoisted(() => []);
vi.mock('../services/websocket.js', () => ({ sendCommand: vi.fn(() => true) }));
vi.mock('../components/simulator/SimulatorWorld.jsx', () => ({ default: function World() {
  useEffect(() => { observed.push({ ...useSimulatorStore.getState(), challenge: useChallengeStore.getState().active }); }, []);
  return <div>Flight world</div>;
} }));

const liveFrame = { latitude: 6.9271, longitude: 79.843, altitude: 35, relativeAltitude: 25, roll: 0, pitch: 0, yaw: 90, flightMode: 'GUIDED', isArmed: true, receivedAt: 10000 };
beforeEach(() => {
  observed.length = 0;
  vi.spyOn(performance, 'now').mockReturnValue(10000);
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  useSimulatorStore.setState({ launchPoint: 'galle-face', flightSource: 'auto', tilesEnabled: true, isPaused: true, isDestroyed: true, cameraMode: 'fpv', isRecording: false, isHudVisible: true });
  useChallengeStore.setState({ active: { id: 'first-flight', runId: 'test', stage: 0 }, lastOutcome: null });
  useTelemetryStore.setState({ data: { ...liveFrame } });
  useConnectionStore.setState({ status: 'connected' });
  useCommandStore.getState().reset();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('launches Port City before the world mounts, despite a challenge, live GPS, saved camera or tiles', () => {
  render(<MemoryRouter initialEntries={['/simulator?launch=port-city']}><SimulatorPage/></MemoryRouter>);
  expect(observed[0]).toMatchObject({ launchPoint: 'port-city', flightSource: 'demo', tilesEnabled: false, cameraMode: 'chase', isPaused: false, isDestroyed: false, challenge: null });
  expect(hasLivePosition(liveFrame, true, 10000, observed[0].flightSource)).toBe(false);
  expect(screen.getByText('Port City · Offline flight')).toBeInTheDocument();
});

it('keeps explicit Port City launches on reload and lets live flight take over again when chosen', () => {
  expect(prepareFlightLaunch('port-city')).toBe(true);
  expect(prepareFlightLaunch('port-city')).toBe(true);
  expect(useSimulatorStore.getState().launchPoint).toBe('port-city');
  expect(prepareFlightLaunch('live')).toBe(true);
  expect(hasLivePosition(useTelemetryStore.getState().data, true, 10000, useSimulatorStore.getState().flightSource)).toBe(true);
  expect(useTelemetryStore.getState().data).toEqual(liveFrame);
  const state = useSimulatorStore.getState();
  expect(prepareFlightLaunch('unknown')).toBe(false);
  expect(useSimulatorStore.getState()).toBe(state);
});


it('opens live controls through the explicit live station and cannot transmit a command from home', () => {
  render(<MemoryRouter><DashboardView/></MemoryRouter>);
  expect(screen.getByRole('link', {name:/Open live station/})).toHaveAttribute('href','/live');
  expect(screen.getByRole('link', {name:'Explore Port City'})).toHaveAttribute('href','/simulator?launch=port-city');
  expect(screen.queryByRole('button',{name:'RTL'})).not.toBeInTheDocument();
  expect(sendCommand).not.toHaveBeenCalled();
});
