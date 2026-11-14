/**
 * simulator/demoInput.js
 *
 * Shared keyboard input state for demo flight (no live telemetry).
 * Updated each rAF frame by SimulatorPage, consumed by SimulatorWorld.
 *
 * Extracted into its own module to break the circular import that would
 * occur if SimulatorWorld imported directly from SimulatorPage.
 */

export const demoInput = {
  throttle: 0,  // -1 … +1  (W = up, S = down)
  yaw:      0,  // -1 … +1  (Q/A = left, E/D = right)
  pitch:    0,  // -1 … +1  (↑ = forward/nose-down, ↓ = back/nose-up)
  roll:     0,  // -1 … +1  (← = left, → = right)
};

