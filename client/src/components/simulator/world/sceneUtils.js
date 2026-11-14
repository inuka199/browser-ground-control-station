import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function seededRandom(seed = 42) {
  let value = seed;
  return () => { value = (value * 16807) % 2147483647; return (value - 1) / 2147483646; };
}

/** Dispose shared resources once, including texture maps and instance buffers. */
export function disposeObject(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of [object.material].flat().filter(Boolean)) materials.add(material);
    if (object.isInstancedMesh) object.dispose();
    if (object.isLight) object.shadow?.dispose();
  });
  materials.forEach(material => {
    Object.values(material).forEach(value => { if (value?.isTexture) textures.add(value); });
    Object.values(material.uniforms ?? {}).forEach(uniform => { if (uniform.value?.isTexture) textures.add(uniform.value); });
    material.dispose();
  });
  textures.forEach(texture => texture.dispose());
  geometries.forEach(geometry => geometry.dispose());
}

/** Merge static details by material and sector to retain frustum culling. */
export function staticBatch(group) {
  const batches = new Map();
  const transform = new THREE.Object3D();
  const box = new THREE.BoxGeometry(1, 1, 1);
  function add(geometry, material, position, scale = [1, 1, 1], rotation = [0, 0, 0]) {
    transform.position.set(...position); transform.scale.set(...scale); transform.rotation.set(...rotation); transform.updateMatrix();
    const key = `${material.uuid}:${Math.floor(position[0] / 240)}:${Math.floor(position[2] / 240)}`;
    if (!batches.has(key)) batches.set(key, { material, geometries: [] });
    batches.get(key).geometries.push(geometry.clone().applyMatrix4(transform.matrix));
  }
  return {
    add,
    box: (material, position, scale, rotation) => add(box, material, position, scale, rotation),
    finish() {
      batches.forEach(({ material, geometries }) => {
        const mesh = new THREE.Mesh(mergeGeometries(geometries), material);
        mesh.castShadow = !material.transparent; mesh.receiveShadow = true;
        group.add(mesh);
        geometries.forEach(geometry => geometry.dispose());
      });
      batches.clear(); box.dispose();
    },
  };
}
