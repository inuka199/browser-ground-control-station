import * as THREE from 'three';
import { seededRandom } from './sceneUtils.js';

const dropsByQuality = { low: 300, balanced: 720, high: 1200 };
const wrap = THREE.MathUtils.euclideanModulo;

export function buildStormEffects(group) {
  const random = seededRandom(847);
  const count = dropsByQuality.high;
  const seeds = Array.from({ length: count }, () => ({
    x: random() * 44, y: random() * 28, z: random() * 44,
    speed: 15 + random() * 6, length: 0.35 + random() * 0.42,
  }));
  const geometry = new THREE.BufferGeometry();
  const points = new THREE.BufferAttribute(new Float32Array(count * 6), 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', points);
  const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({
    color: 0xc6d9eb, transparent: true, opacity: 0, depthWrite: false,
  }));
  rain.name = 'Rain'; rain.visible = false; rain.frustumCulled = false;
  group.add(rain);

  const segments = 13;
  const path = new THREE.BufferAttribute(new Float32Array(segments * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const boltGeometry = new THREE.BufferGeometry();
  boltGeometry.setAttribute('position', path);
  const bolt = new THREE.LineSegments(boltGeometry, new THREE.LineBasicMaterial({
    color: 0xe5ebff, transparent: true, depthWrite: false, fog: false,
  }));
  bolt.name = 'Lightning'; bolt.visible = false; bolt.frustumCulled = false;
  group.add(bolt);
  const forward = new THREE.Vector3();
  let lastStrike;
  function placeBolt(camera, strike) {
    camera.getWorldDirection(forward);
    const azimuth = Math.atan2(forward.x, forward.z) + strike.angle;
    bolt.position.set(camera.position.x + strike.distance * Math.sin(azimuth), 0,
      camera.position.z + strike.distance * Math.cos(azimuth));
    const top = Math.max(260, camera.position.y + 150);
    let x = 0, y = top, z = 0;
    for (let i = 0; i < segments; i++) {
      // The last four segments branch from the upper third of the bolt.
      if (i === 9) { x = path.getX(5); y = path.getY(5); z = path.getZ(5); }
      path.setXYZ(i * 2, x, y, z);
      x += (random() - 0.5) * 25 + (i >= 9 ? 15 : 1);
      z += (random() - 0.5) * 20;
      y -= top / (i >= 9 ? 15 : 9);
      path.setXYZ(i * 2 + 1, x, y, z);
    }
    path.needsUpdate = true;
  }
  return function update(time, weather, quality, camera) {
    rain.visible = weather.rain > 0.01;
    if (rain.visible) {
      const n = dropsByQuality[quality] ?? dropsByQuality.balanced;
      const eye = camera.position;
      const floor = Math.max(0, eye.y - 14);
      for (let i = 0; i < n; i++) {
        const drop = seeds[i];
        const x = eye.x - 22 + wrap(drop.x + time * 2.6 - eye.x, 44);
        const y = floor + wrap(drop.y - time * drop.speed - floor, 28);
        const z = eye.z - 22 + wrap(drop.z - eye.z, 44);
        points.setXYZ(i * 2, x, y, z);
        points.setXYZ(i * 2 + 1, x - 0.09, y + drop.length, z);
      }
      geometry.setDrawRange(0, n * 2);
      points.needsUpdate = true;
      rain.material.opacity = weather.rain * 0.57;
    }
    bolt.visible = weather.flash > 0.02 && !!weather.strike;
    if (bolt.visible) {
      if (lastStrike !== weather.strike) placeBolt(camera, weather.strike);
      lastStrike = weather.strike;
      bolt.material.opacity = weather.flash;
    }
  };
}
