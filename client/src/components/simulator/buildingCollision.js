// Conservative drone clearance around the visible building meshes.
export function distanceToBox(point, box) {
  const dx = Math.max(box.min.x - point.x, 0, point.x - box.max.x);
  const dy = Math.max(box.min.y - point.y, 0, point.y - box.max.y);
  const dz = Math.max(box.min.z - point.z, 0, point.z - box.max.z);
  return Math.hypot(dx, dy, dz);
}

export function nearestBuildingDistance(point, boxes) {
  return boxes.reduce((distance, box) => Math.min(distance, distanceToBox(point, box)), Infinity);
}

export function moveAroundBuildings(previous, next, boxes, clearance = 1) {
  const blocked = (point) => boxes.some((box) => distanceToBox(point, box) < clearance);
  // The flight model advances at most 1 m per frame, but substeps also cover lag spikes.
  const steps = Math.max(1, Math.ceil(Math.hypot(next.x - previous.x, next.y - previous.y, next.z - previous.z) / 0.4));
  // Return position only: the previous state's yaw and other fields must not
  // overwrite the flight model's newly calculated attitude.
  let current = { x: previous.x, y: previous.y, z: previous.z };
  const delta = {
    x: (next.x - previous.x) / steps,
    y: (next.y - previous.y) / steps,
    z: (next.z - previous.z) / steps,
  };
  for (let i = 0; i < steps; i++) {
    for (const axis of ['x', 'y', 'z']) {
      const candidate = { ...current, [axis]: current[axis] + delta[axis] };
      if (!blocked(candidate)) current = candidate;
    }
  }
  return current;
}
