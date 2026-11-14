export function validatePath(path) {
  if (!Array.isArray(path) || path.length < 2 || path.length > 10000) throw new Error('A flight needs between 2 and 10,000 position samples.');
  let previous = -Infinity;
  return path.map(point => {
    if (!point || ![point.x, point.y, point.z, point.t].every(Number.isFinite) || point.t < previous || Math.max(Math.abs(point.x), Math.abs(point.y), Math.abs(point.z)) > 1e7) throw new Error('Invalid position or out-of-order timestamp in flight file.');
    previous = point.t;
    return { x: point.x, y: point.y, z: point.z, t: point.t };
  });
}

export function flightMetrics(points, fraction = 1) {
  if (!points.length) return { distance: 0, peak: 0, duration: 0, position: { x: 0, y: 0, z: 0 }, travelled: 0 };
  const duration = Math.max(0, points.at(-1).t - points[0].t);
  const time = points[0].t + Math.min(1, Math.max(0, fraction)) * duration;
  let distance = 0, travelled = 0, peak = 0, position = points[0];
  points.forEach((p, i) => {
    peak = Math.max(peak, p.y);
    if (!i) return;
    const before = points[i - 1], segment = Math.hypot(p.x - before.x, p.y - before.y, p.z - before.z);
    distance += segment;
    const blend = p.t === before.t ? (time >= p.t ? 1 : 0) : Math.min(1, Math.max(0, (time - before.t) / (p.t - before.t)));
    travelled += segment * blend;
    if (time >= before.t) position = { x: before.x + (p.x - before.x) * blend, y: before.y + (p.y - before.y) * blend, z: before.z + (p.z - before.z) * blend };
  });
  return { distance, peak, duration: duration / 1000, position, travelled };
}

export function flightCSV(points) {
  const start = points[0]?.t ?? 0;
  return 'elapsed_s,east_m,altitude_m,south_m\n' + points.map(p => [(p.t - start) / 1000, p.x, p.y, p.z].join(',')).join('\n');
}

export function downloadFile(name, contents, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
