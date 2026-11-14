import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export function validateMission(points) {
  if (!Array.isArray(points) || points.length < 2 || points.length > 50) throw new Error('Use 2–50 waypoints.');
  return points.map((point, index) => {
    if (['x','y','z'].some(key => point[key] === '' || !Number.isFinite(Number(point[key])))) throw new Error('Enter all coordinates for waypoint ' + (index + 1) + '.');
    const p = { x: Number(point.x), y: Number(point.y), z: Number(point.z) };
    if (Math.abs(p.x) > 2000 || Math.abs(p.z) > 2000 || p.y < 0 || p.y > 500) throw new Error('Waypoint ' + (index + 1) + ': use ±2,000 m east/south and 0–500 m altitude.');
    return p;
  });
}
export function missionPath(points) {
  const route = validateMission(points); let t = 0;
  return route.map((p, index) => {
    if (index) { const last = route[index - 1]; t += Math.max(1000, Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) / 10 * 1000); }
    return { ...p, t };
  });
}
export const useMissionStore = create(persist(set => ({
  points: [{x:0,y:0,z:0},{x:0,y:20,z:0},{x:60,y:20,z:-60},{x:0,y:0,z:0}],
  save: points => set({ points: validateMission(points) }),
}), { name: 'nexus-mission-plan' }));
