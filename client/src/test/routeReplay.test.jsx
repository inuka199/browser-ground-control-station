import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import EnvironmentView from '../components/views/EnvironmentView.jsx';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useConnectionStore } from '../store/slices/connection.js';
import { useSimulatorStore } from '../store/slices/simulator.js';

const renderer = vi.hoisted(() => ({ created: 0, scene: null, camera: null, fail: false }));
vi.mock('three', async importOriginal => {
  const actual = await importOriginal();
  return { ...actual, WebGLRenderer: class {
    constructor() { if (renderer.fail) throw new Error('No WebGL'); renderer.created++; this.domElement = document.createElement('canvas'); }
    setPixelRatio() {} setClearColor() {} setSize() {} dispose() {} forceContextLoss() {}
    render(scene, camera) { renderer.scene = scene; renderer.camera = camera; }
  } };
});
vi.mock('three/examples/jsm/controls/OrbitControls.js', async () => {
  const { Vector3 } = await import('three');
  return { OrbitControls: class { target = new Vector3(); update() {} dispose() {} } };
});

let animate;
const wall = 1800000000000;
const sample = { latitude: 40, longitude: -74, relativeAltitude: 15, positionTimestamp: wall };
const savedPath = [{ x: 0, y: 2, z: 0, t: 0 }, { x: 50, y: 10, z: 20, t: 5000 }];
beforeEach(() => {
  renderer.created = 0; renderer.scene = null; renderer.fail = false;
  vi.spyOn(performance, 'now').mockReturnValue(10000);
  vi.spyOn(Date, 'now').mockReturnValue(wall);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ fillRect() {}, fillText() {} });
  vi.stubGlobal('requestAnimationFrame', vi.fn(callback => { animate = callback; return 1; }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  useTelemetryStore.getState().reset();
  useConnectionStore.setState({ status: 'connected' });
  useSimulatorStore.setState({ flownPath: savedPath, routeLabel: 'Saved flight' });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const tick = () => act(() => animate(performance.now()));
const drone = () => renderer.scene.children.find(child => child.isGroup && child.children.some(mesh => mesh.geometry?.type === 'BoxGeometry'));

it('defaults to the recorded path despite live GPS, and only follows live when selected', () => {
  useTelemetryStore.getState().applyUpdate(sample);
  render(<EnvironmentView/>);
  tick();
  expect(screen.getByRole('button', { name: 'Recorded flight' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('SAVED FLIGHT')).toBeInTheDocument();
  expect(drone().position.toArray()).toEqual([0, 2, 0]);
  expect(screen.getByRole('button', { name: 'Play route' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Follow live drone' }));
  tick();
  expect(drone().position.toArray()).toEqual([0, 15, -0]);
  expect(screen.queryByRole('button', { name: 'Play route' })).not.toBeInTheDocument();
  vi.mocked(Date.now).mockReturnValue(wall + 100);
  vi.mocked(performance.now).mockReturnValue(10100);
  act(() => useTelemetryStore.getState().applyUpdate({ ...sample, latitude: 40.001, relativeAltitude: 25, positionTimestamp: wall + 100 }));
  tick();
  expect(drone().position.z).toBeCloseTo(-111.195, 2);
  expect(drone().position.y).toBe(25);
  expect(renderer.created).toBe(1);
  expect(useSimulatorStore.getState().flownPath).toBe(savedPath);
  expect(renderer.camera.position.toArray().every(Number.isFinite)).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Recorded flight' }));
  act(() => useTelemetryStore.getState().applyUpdate({ ...sample, relativeAltitude: 30, positionTimestamp: wall + 100 }));
  tick();
  expect(drone().position.toArray()).toEqual([0, 2, 0]);
  expect(screen.getByRole('button', { name: 'Recorded flight' })).toHaveAttribute('aria-pressed', 'true');
});

it('restores replay progress after stale GPS, invalid packets, and disconnects, then recovers', () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  render(<EnvironmentView/>);
  fireEvent.change(screen.getByLabelText('Flight progress'), { target: { value: '0.5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Follow live drone' }));
  for (const drop of [
    () => { vi.mocked(Date.now).mockReturnValue(wall + 5000); vi.mocked(performance.now).mockReturnValue(15000); act(() => vi.advanceTimersByTime(500)); },
    () => act(() => useTelemetryStore.getState().applyUpdate({ ...sample, longitude: NaN })),
    () => act(() => useConnectionStore.setState({ status: 'disconnected' })),
  ]) {
    vi.mocked(Date.now).mockReturnValue(wall);
    vi.mocked(performance.now).mockReturnValue(10000);
    act(() => { useConnectionStore.setState({ status: 'connected' }); useTelemetryStore.getState().applyUpdate(sample); });
    tick();
    expect(screen.getAllByText('LIVE ROUTE').length).toBeGreaterThan(0);
    drop(); tick();
    expect(screen.getByLabelText('Flight progress')).toHaveValue('0.5');
    expect(drone().position.toArray()).toEqual([25, 6, 10]);
  }
  expect(renderer.created).toBe(1);
});

it('uses the demo route for malformed saved paths and handles unavailable WebGL', () => {
  useSimulatorStore.setState({ flownPath: [{ x: NaN }], routeLabel: null });
  renderer.fail = true;
  render(<EnvironmentView/>);
  expect(screen.getByText('DEMO ROUTE')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('could not start 3D rendering');
  expect(screen.getByRole('button', { name: 'Play route' })).toBeEnabled();
});
