import * as THREE from 'three';

// Model axes are metres, with +Z forward. Solid parts also define the
// dimensions consumed by the simulator. Lamps and tyres are included.
function vehicle(build) {
  const parts = [];
  let halfWidth = 0, halfLength = 0, height = 0;
  function part(material, x, y, z, width, depthY, length) {
    const matrix = new THREE.Matrix4().makeScale(width, depthY, length);
    matrix.setPosition(x, y, z);
    parts.push({ material, matrix });
    if (material === 'beam') return;
    halfWidth = Math.max(halfWidth, Math.abs(x) + width / 2);
    halfLength = Math.max(halfLength, Math.abs(z) + length / 2);
    height = Math.max(height, y + depthY / 2);
  }
  function wheel(x, z, diameter) {
    part('tyre', x, diameter / 2, z, 0.20, diameter, diameter);
    part('hub', x, diameter / 2, z, 0.22, diameter * 0.55, diameter * 0.55);
  }
  function axle(track, z, diameter) {
    wheel(-track / 2, z, diameter);
    wheel(track / 2, z, diameter);
  }
  function lights(halfTrack, y, nose, tail) {
    for (const x of [-halfTrack, halfTrack]) {
      part('headlamp', x, y, nose, 0.26, 0.16, 0.06);
      part('taillamp', x, y, tail, 0.22, 0.16, 0.06);
      part('brake', x, y, tail-0.032, 0.21, 0.15, 0.025);
    }
    part('beam', 0, 0.065, nose + 3.8, 4.2, 1, 7.6);
  }
  build(part, axle, wheel, lights);
  return { parts, halfWidth, halfLength, height };
}

const models = {
  sedan: vehicle((p, axle, _wheel, lights) => {
    p('paint', 0, 0.66, 0, 1.85, 0.66, 4.1);
    p('glass', 0, 1.23, -0.2, 1.6, 0.63, 2.25);
    p('paint', 0, 1.57, -0.2, 1.65, 0.12, 1.95);
    axle(1.74, -1.28, 0.68); axle(1.74, 1.28, 0.68);
    lights(0.64, 0.8, 2.05, -2.05);
  }),
  bus: vehicle((p, axle, _wheel, lights) => {
    p('paint', 0, 0.99, 0, 2.30, 1.32, 7.2);
    p('glass', 0, 2.12, 0, 2.24, 0.95, 7.14);
    for (const z of [-2.7, -1.35, 0, 1.35, 2.7])
      p('paint', 0, 2.12, z, 2.28, 0.95, 0.09);
    p('paint', 0, 2.69, 0, 2.32, 0.22, 7.2);
    axle(2.1, -2.35, 0.88); axle(2.1, 2.35, 0.88);
    lights(0.86, 0.85, 3.6, -3.6);
  }),
  deliveryVan: vehicle((p, axle, _wheel, lights) => {
    p('paint', 0, 0.72, 0, 1.97, 0.85, 4.85);
    p('paint', 0, 1.55, -0.73, 1.98, 1.65, 3.39);
    p('glass', 0, 1.53, 1.56, 1.84, 0.76, 1.2);
    p('paint', 0, 1.98, 1.52, 1.94, 0.17, 1.34);
    axle(1.82, -1.48, 0.72); axle(1.82, 1.59, 0.72);
    lights(0.7, 0.87, 2.425, -2.425);
  }),
  pickup: vehicle((p, axle, _wheel, lights) => {
    p('paint', 0, 0.77, 0, 1.94, 0.72, 4.9);
    p('glass', 0, 1.48, 0.66, 1.80, 0.78, 1.62);
    p('paint', 0, 1.94, 0.63, 1.89, 0.14, 1.72);
    p('trim', 0, 1.15, -1.29, 1.67, 0.10, 2.00);
    for(const side of [-1,1]) {
      p('paint', side*0.91, 1.33, -1.28, 0.13, 0.45, 2.24);
      p('trim', side*0.99, 1.54, 1.22, 0.22, 0.17, 0.27);
    }
    p('paint', 0, 1.34, -2.38, 1.91, 0.43, 0.14);
    axle(1.85, -1.51, 0.83); axle(1.85, 1.56, 0.83);
    lights(0.73, 0.92, 2.45, -2.45);
  }),
  tukTuk: vehicle((p, axle, wheel, lights) => {
    p('paint', 0, 0.64, -0.36, 1.38, 0.67, 1.98);
    p('paint', 0, 0.90, 0.83, 0.85, 0.71, 0.62);
    p('glass', 0, 1.41, 0.70, 1.14, 0.61, 0.09);
    for (const x of [-0.59, 0.59]) p('trim', x, 1.37, -1.09, 0.08, 0.92, 0.1);
    p('trim', 0, 1.80, -0.18, 1.42, 0.17, 2.16);
    p('trim', 0, 0.99, -0.77, 1.16, 0.21, 0.49);
    axle(1.18, -0.86, 0.52); wheel(0, 1.14, 0.52);
    lights(0.28, 0.93, 1.14, -1.35);
  }),
};

const mix = ['bus', 'sedan', 'tukTuk', 'deliveryVan', 'pickup', 'tukTuk', 'sedan'];
export function roadVehicleAt(index) {
  const kind = mix[index % mix.length];
  return { kind, ...models[kind] };
}

// Pack per-material instances in traffic order. Showing a lower-quality
// prefix only changes draw counts. All local transforms are shared by type.
export function buildRoadFleet(cars, instances, shapes, materials) {
  const counts = Object.fromEntries(Object.keys(materials).map(key => [key, 0]));
  const packed = cars.map(car => {
    const parts = car.model.parts.map(({material, matrix}) => ({material, matrix, slot: counts[material]++}));
    return { parts, end: { ...counts } };
  });
  const meshes = {};
  for (const [key, material] of Object.entries(materials)) {
    const mesh = instances(shapes[key] ?? shapes.box, material, counts[key]);
    mesh.name = 'Traffic ' + key;
    if (key === 'beam') mesh.castShadow = false;
    meshes[key] = mesh;
  }
  function setPaint(index, color) {
    for (const part of packed[index].parts) {
      if (part.material === 'paint') meshes.paint.setColorAt(part.slot, color);
    }
    meshes.paint.instanceColor.needsUpdate = true;
  }
  cars.forEach((car, index) => setPaint(index, car.color));
  const world = new THREE.Matrix4();
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  return {
    setPaint,
    setCount(visible) {
      for (const [key, mesh] of Object.entries(meshes)) mesh.count = visible ? packed[visible - 1].end[key] : 0;
    },
    place(index, root, lightsOn, braking) {
      for (const { material, matrix, slot } of packed[index].parts) {
        const light = material === 'beam' || material === 'headlamp' || material === 'taillamp';
        const hide=(light && !lightsOn) || (material==='brake' && !(lightsOn && braking));
        meshes[material].setMatrixAt(slot, hide ? hidden : world.multiplyMatrices(root, matrix));
      }
    },
  };
}
