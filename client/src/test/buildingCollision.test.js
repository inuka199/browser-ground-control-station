// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { distanceToBox, moveAroundBuildings } from '../components/simulator/buildingCollision.js';
import { stepFlight } from '../components/simulator/flightDynamics.js';

const building = { min: { x: 4, y: 0, z: -2 }, max: { x: 8, y: 20, z: 2 } };

describe('building barriers', () => {
  it('blocks a drone crossing a wall, including a long frame', () => {
    const start = { x: 0, y: 5, z: 0 };
    const stopped = moveAroundBuildings(start, { x: 12, y: 5, z: 0 }, [building]);
    expect(stopped.x).toBeLessThanOrEqual(3);
    expect(distanceToBox(stopped, building)).toBeGreaterThanOrEqual(1);
  });

  it('allows movement beside and above a building', () => {
    expect(moveAroundBuildings({ x: 0, y: 5, z: 4 }, { x: 12, y: 5, z: 4 }, [building]).x).toBeCloseTo(12);
    expect(moveAroundBuildings({ x: 0, y: 22, z: 0 }, { x: 12, y: 22, z: 0 }, [building]).x).toBeCloseTo(12);
  });

  it('preserves the new heading when collision-corrected position is merged into flight state', () => {
    for (const yaw of [-1, 1]) {
      let drone = { x: 0, y: 5, z: 0, yaw: 0, grounded: false };
      for (let i = 0; i < 20; i++) {
        const proposed = stepFlight(drone, { yaw, throttle: 0, pitch: 0, roll: 0 }, 0.05);
        drone = { ...proposed, ...moveAroundBuildings(drone, proposed, [building]) };
      }
      expect(drone.yaw).toBeCloseTo(-1.4 * yaw);
    }
  });
});
