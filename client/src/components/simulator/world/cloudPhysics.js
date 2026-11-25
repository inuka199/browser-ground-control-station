import { seededRandom } from './sceneUtils.js';

const spacing = 540;
const rows = 5;
const period = rows * spacing;
const clamp01 = value => Math.max(0, Math.min(1, value));
const wrap = offset => offset - period * Math.floor(offset / period + 0.5);

// Local metres, +X east and -Z north. Repeat the field beyond the playable coast.
export function createCloudField() {
  const random = seededRandom(8701);
  const cells = [];
  for (let row = -2; row <= 2; row++) {
    for (let col = -2; col <= 2; col++) {
      const nearby = row === 0 && col === 0;
      const level = nearby ? 76 : 115 + random() * 140;
      const angle = random() * Math.PI * 2;
      cells.push({
        originX: nearby ? -30 : (col + (random() - 0.5) * 0.65) * spacing,
        originZ: nearby ? -135 : (row + (random() - 0.5) * 0.65) * spacing,
        level, phase: nearby ? 1.1 : random() * Math.PI * 2,
        frequency: 2 * Math.PI / (120 + random() * 100),
        width: 115 + random() * 58, depth: 79 + random() * 39,
        cos: Math.cos(angle), sin: Math.sin(angle),
        x: 0, y: 0, z: 0, radiusX: 0, radiusY: 0, radiusZ: 0, opacity: 0,
      });
    }
  }
  const upper = cells.filter((_,i)=>i%4===1).map(cell=>({
    ...cell, level:690+random()*320, width:cell.width*3, depth:cell.depth*2.5,
    originX:cell.originX*2.5, originZ:cell.originZ*2.5, upper:true,
  }));
  cells.push(...upper);
  let lastTime = 0, driftX = 0, driftZ = 0, moisture = 0;
  function update(elapsed, wind, rain, camera) {
    const dt = Math.max(0, elapsed - lastTime);
    lastTime = elapsed;
    const bearing = wind.directionDeg * Math.PI / 180;
    driftX += wind.speedMs * Math.sin(bearing) * dt;
    driftZ -= wind.speedMs * Math.cos(bearing) * dt;
    // Saturated air accumulates during showers and dries more slowly afterwards.
    moisture += (rain - moisture) * -Math.expm1(-dt / (rain > moisture ? 6 : 14));
    for (const cell of cells) {
      const shear = 1 + (cell.level - 76) / 650;
      const band=cell.upper ? 2.5 : 1;
      const dx = band*wrap((cell.originX + driftX * shear - camera.x)/band);
      const dz = band*wrap((cell.originZ + driftZ * shear - camera.z)/band);
      cell.x = camera.x + dx;
      cell.z = camera.z + dz;
      // A rising air parcel condenses above the local cloud base. As the
      // parcel subsides, its cloudy depth and liquid water diminish together.
      const base = cell.level - 38 * moisture;
      const parcelTop = cell.level + 33 + 46 * Math.sin(cell.phase + elapsed * cell.frequency) + 41 * moisture;
      const depth = Math.max(0, parcelTop - base);
      cell.radiusY = Math.max(1, depth * 0.5);
      cell.y = base + cell.radiusY;
      const spread = 0.55 + 0.55 * Math.sqrt(depth / 80);
      cell.radiusX = cell.width * spread;
      cell.radiusZ = cell.depth * spread;
      // Fade before changing periodic copies, including at diagonal seams.
      const edge = clamp01((period / 2 - Math.max(Math.abs(dx), Math.abs(dz))/band) / 260);
      cell.opacity = clamp01(depth / 46) * edge * (0.78 + 0.22 * moisture);
    }
  }
  return { cells, update };
}

// Convert the camera to the same oriented texture space the renderer uses.
export function cloudWaterAt(cells, point, volume) {
  let water = 0;
  for (const c of cells) {
    const y = (point.y - c.y) / c.radiusY;
    if (!(Math.abs(y) < 1) || c.opacity === 0) continue;
    const dx = point.x - c.x, dz = point.z - c.z;
    const x = (c.cos * dx - c.sin * dz) / c.radiusX;
    const z = (c.sin * dx + c.cos * dz) / c.radiusZ;
    if (Math.abs(x) < 1 && Math.abs(z) < 1) {
      water += c.opacity * volume.densityAt(x, y, z);
    }
  }
  return Math.min(1, water);
}
