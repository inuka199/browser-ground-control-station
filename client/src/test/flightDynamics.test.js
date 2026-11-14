// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createFlight, stepFlight, flightInstruments, hasLivePosition } from '../components/simulator/flightDynamics.js';

const input = (values = {}) => ({ throttle: 0, yaw: 0, pitch: 0, roll: 0, ...values });

describe('offline flight', () => {
  it('stays grounded until throttle and lands without going underground', () => {
    const initial = createFlight();
    expect(stepFlight(initial, input({ pitch: 1 }), 0.05)).toEqual(initial);
    const airborne = stepFlight(initial, input({ throttle: 1 }), 0.05);
    expect(airborne.y).toBeCloseTo(0.4);
    expect(airborne.grounded).toBe(false);
    const landed = stepFlight(airborne, input({ throttle: -1 }), 0.05);
    expect(landed.y).toBe(0);
    expect(landed.grounded).toBe(true);
    expect(initial).toEqual(createFlight());
  });

  it('moves forward along the rendered heading and limits diagonal speed', () => {
    const start = { ...createFlight(), y: 10, grounded: false, yaw: Math.PI / 2 };
    const next = stepFlight(start, input({ pitch: 1 }), 0.05);
    expect(next.x).toBeCloseTo(-1);
    expect(next.z).toBeCloseTo(0);
    const diagonal = stepFlight(start, input({ pitch: 1, roll: 1 }), 0.05);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
    expect(flightInstruments(next, start, 0.05, input()).groundSpeed).toBeCloseTo(20);
  });

  it('rolls away from home in both directions while holding altitude', () => {
    const start = { ...createFlight(), y: 10, grounded: false };
    for (const direction of [-1, 1]) {
      let state = start;
      for (let i = 0; i < 60; i++) {
        state = stepFlight(state, input({ roll: direction }), 1 / 60);
      }
      expect(state.x).toBeCloseTo(direction * 20);
      expect(state.z).toBeCloseTo(0);
      expect(state.y).toBe(10);
      expect(state.grounded).toBe(false);
    }
  });

  it('is independent of frame rate and caps long frames', () => {
    const fly = (hz) => {
      let state = { ...createFlight(), y: 10, grounded: false };
      for (let i = 0; i < hz; i++) state = stepFlight(state, input({ pitch: 1 }), 1 / hz);
      return state;
    };
    expect(fly(30).z).toBeCloseTo(fly(120).z);
    expect(stepFlight(createFlight(), input({ throttle: 1 }), 20).y).toBeCloseTo(0.4);
  });

  it('requires connected, fresh, finite GPS before selecting live flight', () => {
    const data = { latitude: 0, longitude: 0, receivedAt: 0 };
    expect(hasLivePosition(data, true, 100)).toBe(true);
    expect(hasLivePosition(data, false, 100)).toBe(false);
    expect(hasLivePosition(data, true, 5000)).toBe(false);
    expect(hasLivePosition({ ...data, latitude: NaN }, true, 100)).toBe(false);
  });
});
