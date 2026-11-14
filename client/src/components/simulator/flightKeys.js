export const FLIGHT_KEYS = ['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'];
export function flightAxes(keys) {
  return {
    throttle: keys.has('KeyW') ? 1 : keys.has('KeyS') ? -1 : 0,
    yaw: keys.has('KeyA') ? -1 : keys.has('KeyD') ? 1 : 0,
    pitch: keys.has('ArrowUp') ? 1 : keys.has('ArrowDown') ? -1 : 0,
    roll: keys.has('ArrowLeft') ? -1 : keys.has('ArrowRight') ? 1 : 0,
  };
}
