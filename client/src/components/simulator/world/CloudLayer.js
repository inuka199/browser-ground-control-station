import * as THREE from 'three';
import { cloudWaterAt, createCloudField } from './cloudPhysics.js';
import { createCloudVolume } from './cloudVolume.js';

const samplesByQuality = { low: 6, balanced: 12, high: 20 };

const vertexShader = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
attribute float waterContent;
uniform vec3 eyeInLayer;
varying float vWater;
varying vec3 vBack, vEye, vRadii;
varying vec2 vProjection;
void main() {
  mat3 axes = mat3(instanceMatrix);
  vRadii = vec3(length(axes[0]), length(axes[1]), length(axes[2]));
  vec3 relativeEye = eyeInLayer - instanceMatrix[3].xyz;
  vEye = vec3(dot(relativeEye, axes[0]), dot(relativeEye, axes[1]), dot(relativeEye, axes[2])) / (vRadii * vRadii);
  vBack = position;
  vWater = waterContent;
  vProjection = vec2(projectionMatrix[2][2], projectionMatrix[3][2]);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;

const fragmentShader = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform highp sampler3D volume;
uniform int steps;
uniform float daylight, golden, rainAmount, lightning;
varying float vWater;
varying vec3 vBack, vEye, vRadii;
varying vec2 vProjection;
void main() {
  vec3 ray = normalize(vBack - vEye);
  vec3 inverseRay = (step(vec3(0.0), ray) * 2.0 - 1.0) / max(abs(ray), vec3(0.000001));
  vec3 entry = min((-1.0 - vEye) * inverseRay, (1.0 - vEye) * inverseRay);
  float start = max(0.0, max(entry.x, max(entry.y, entry.z)));
  float end = length(vBack - vEye);
  float stride = (end - start) / float(steps);
  if (stride <= 0.0) discard;
  float opticalStep = stride * length(ray * vRadii) * vWater * 0.047;
  float alpha = 0.0, light = 0.0, depth = 0.0;
  for (int i = 0; i < 20; ++i) {
    if (i >= steps || alpha > 0.99) break;
    float t = start + (float(i) + 0.5) * stride;
    vec2 sampleWater = texture(volume, (vEye + t * ray) * 0.5 + 0.5).rg;
    float absorbed = (1.0 - alpha) * (1.0 - exp(-sampleWater.r * opticalStep));
    alpha += absorbed;
    light += sampleWater.g * absorbed;
    depth += t * absorbed;
  }
  if (alpha < 0.008) discard;
  vec3 shadow = mix(vec3(0.024,0.033,0.059),vec3(0.40,0.48,0.57),daylight);
  vec3 lit = mix(vec3(0.094,0.12,0.17),mix(vec3(0.97,0.98,1.00),vec3(1.00,0.76,0.56),golden*0.75),daylight);
  vec3 color = mix(shadow, lit, light / alpha) * (1.0 - rainAmount * 0.55) + vec3(0.27 * lightning);
  // Test opaque scenery against the contributing water, not the back of its box.
  float viewDepth = max(0.0001, depth / (alpha * end * gl_FragCoord.w));
  #ifdef USE_LOGARITHMIC_DEPTH_BUFFER
    gl_FragDepth = log2(1.0 + viewDepth) * logDepthBufFC * 0.5;
  #else
    gl_FragDepth = 0.5 * (-vProjection.x + vProjection.y / viewDepth + 1.0);
  #endif
  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function buildCloudLayer(group, lighting) {
  const field = createCloudField();
  const volume = createCloudVolume();
  const texture = new THREE.Data3DTexture(volume.data, volume.size, volume.size, volume.size);
  texture.format = THREE.RGFormat;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  const geometry = new THREE.BoxGeometry(2, 2, 2);
  const water = new THREE.InstancedBufferAttribute(new Float32Array(field.cells.length), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('waterContent', water);
  const { daylight, golden, rainAmount, lightning } = lighting;
  const uniforms = { volume:{value:texture}, steps:{value:12}, eyeInLayer:{value:new THREE.Vector3()}, daylight, golden, rainAmount, lightning };
  const material = new THREE.ShaderMaterial({
    uniforms, vertexShader, fragmentShader, side:THREE.BackSide, transparent:true, depthWrite:false,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, field.cells.length);
  mesh.name = 'Clouds';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(mesh);
  const sorted = [...field.cells];
  const matrix = new THREE.Matrix4();
  function update(elapsed, wind, rain, quality, camera, enabled) {
    mesh.visible = enabled;
    if (!enabled) return 0;
    mesh.position.set(2048*Math.trunc(camera.position.x/2048),0,2048*Math.trunc(camera.position.z/2048));
    uniforms.eyeInLayer.value.copy(camera.position).sub(mesh.position);
    field.update(elapsed, wind, rain, camera.position);
    for (const c of sorted) c.distance = camera.position.distanceToSquared(c);
    sorted.sort((a, b) => b.distance - a.distance);
    let count = 0;
    for (const c of sorted) {
      if (c.opacity < 0.001) continue;
      matrix.set(
        c.cos*c.radiusX, 0, c.sin*c.radiusZ, c.x-mesh.position.x,
        0, c.radiusY, 0, c.y,
        -c.sin*c.radiusX, 0, c.cos*c.radiusZ, c.z-mesh.position.z,
        0, 0, 0, 1,
      );
      mesh.setMatrixAt(count, matrix);
      water.setX(count++, c.opacity);
    }
    mesh.count = count;
    mesh.instanceMatrix.needsUpdate = water.needsUpdate = true;
    uniforms.steps.value = samplesByQuality[quality] ?? samplesByQuality.balanced;
    return cloudWaterAt(field.cells, camera.position, volume);
  }
  return update;
}
