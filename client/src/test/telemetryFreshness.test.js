// @vitest-environment node
/**
 * src/test/telemetryFreshness.test.js
 * Unit tests for the telemetry freshness service.
 * Tests: UNKNOWN, HEALTHY, DELAYED, STALE, DISCONNECTED states.
 * Test method: unit (no SITL, no browser).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getTelemetryFreshness } from '../services/telemetryFreshness.js';

describe('getTelemetryFreshness', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns UNKNOWN when receivedAt is null', () => {
    expect(getTelemetryFreshness(null)).toBe('UNKNOWN');
  });

  it('returns UNKNOWN when receivedAt is undefined', () => {
    expect(getTelemetryFreshness(undefined)).toBe('UNKNOWN');
  });

  it('returns HEALTHY when age < 3 s', () => {
    const now = 10_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    expect(getTelemetryFreshness(now - 1_000)).toBe('HEALTHY');
  });

  it('returns DELAYED when 3 s <= age < 8 s', () => {
    const now = 10_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    expect(getTelemetryFreshness(now - 5_000)).toBe('DELAYED');
  });

  it('returns STALE when 8 s <= age < 30 s', () => {
    const now = 10_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    expect(getTelemetryFreshness(now - 15_000)).toBe('STALE');
  });

  it('returns DISCONNECTED when age >= 30 s', () => {
    const now = 50_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    expect(getTelemetryFreshness(now - 31_000)).toBe('DISCONNECTED');
  });

  it('returns HEALTHY at exactly 0 ms age', () => {
    const now = 5_000;
    vi.spyOn(performance, 'now').mockReturnValue(now);
    expect(getTelemetryFreshness(now)).toBe('HEALTHY');
  });
});
