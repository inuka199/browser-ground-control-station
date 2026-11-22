export const ENVIRONMENT_DEFAULTS = {
  timeOfDay: 16.5,
  cycleEnabled: false,
  cycleMinutes: 8,
  quality: 'balanced',
  cityLife: true,
  haze: 0.35,
  weatherMode: 'auto',
};

export function wrapHour(hour) { return ((hour % 24) + 24) % 24; }
export function advanceTime(hour, delta, cycleMinutes) {
  return wrapHour(hour + Math.max(0, delta) * 24 / (Math.max(1, cycleMinutes) * 60));
}
function smoothstep(low, high, value) {
  const t = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}
export function solarState(hour) {
  const angle = (wrapHour(hour) - 6) / 24 * Math.PI * 2;
  const elevation = Math.sin(angle);
  const daylight = smoothstep(-0.15, 0.25, elevation);
  return { angle, elevation, daylight, night: 1 - smoothstep(-0.08, 0.12, elevation), golden: (1 - smoothstep(0.08, 0.6, elevation)) * daylight };
}
export function formatWorldTime(hour) {
  const minutes = Math.round(wrapHour(hour) * 60) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
