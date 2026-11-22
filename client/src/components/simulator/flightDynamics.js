import { isFreshTelemetry } from '../../services/telemetryValidation.js';

// Offline flight model in metres, seconds and radians. This never sends commands.
export const createFlight = () => ({
  x: 0,
  y: 0,
  z: 0,
  yaw: 0,
  grounded: true,
});

export function stepFlight(state, input, seconds) {
  const dt = Math.max(0, Math.min(seconds, 0.05));
  const axis = (value) =>
    Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  const throttle = axis(input.throttle);
  if (state.grounded && throttle <= 0.05) return { ...state };
  const yaw = state.yaw - axis(input.yaw) * 1.4 * dt;
  const pitch = axis(input.pitch);
  const roll = axis(input.roll);
  // Normalize diagonal input so it cannot exceed the horizontal speed limit.
  const scale = (20 * dt) / Math.max(1, Math.hypot(pitch, roll));
  const y = Math.max(0, state.y + throttle * 8 * dt);
  return {
    x: state.x + (-Math.sin(yaw) * pitch + Math.cos(yaw) * roll) * scale,
    z: state.z + (-Math.cos(yaw) * pitch - Math.sin(yaw) * roll) * scale,
    y,
    yaw,
    grounded: y === 0,
  };
}

export function flightInstruments(state, previous, dt, input) {
  return {
    flightMode: "DEMO",
    relativeAltitude: state.y,
    groundSpeed:
      dt > 0 ? Math.hypot(state.x - previous.x, state.z - previous.z) / dt : 0,
    yaw: ((((-state.yaw * 180) / Math.PI) % 360) + 360) % 360,
    roll: state.grounded
      ? 0
      : (-(input.yaw * 0.3 + input.roll * 0.22) * 180) / Math.PI,
    pitch: state.grounded ? 0 : (-input.pitch * 0.18 * 180) / Math.PI,
    isArmed: !state.grounded,
  };
}

export function hasLivePosition(data, connected, now, source = 'auto') {
  return source !== 'demo' && connected === true && isFreshTelemetry(data, now);
}
