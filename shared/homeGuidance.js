export const wrap360 = value => ((value % 360) + 360) % 360;
export const wrap180 = value => wrap360(value + 180) - 180;
export function validCoordinate(point) {
  return point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;
}
export function homeVector(position, home, heading = null) {
  if (!validCoordinate(position) || !validCoordinate(home)) return null;
  const r = Math.PI / 180, lat1 = position.latitude * r, lat2 = home.latitude * r;
  const dl = wrap180(home.longitude - position.longitude) * r, dp = lat2 - lat1;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dl / 2) ** 2;
  const distance = 6371008.8 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
  const bearing = distance < 2 ? null : wrap360(Math.atan2(Math.sin(dl) * Math.cos(lat2), Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dl)) / r);
  return { distance, bearing, relativeBearing: bearing !== null && Number.isFinite(heading) ? wrap180(bearing - heading) : null, nearHome: distance < 2 };
}
export function distanceWarning(previous, distance, warning, limit, hysteresis = 5) {
  if (![distance, warning, limit].every(Number.isFinite) || warning <= 0 || warning >= limit) return 'UNKNOWN';
  if (distance >= limit) return 'BREACH';
  if (previous === 'BREACH' && distance >= limit - hysteresis) return 'BREACH';
  if (distance >= warning || (previous === 'WARNING' && distance >= warning - hysteresis)) return 'WARNING';
  return 'NORMAL';
}
