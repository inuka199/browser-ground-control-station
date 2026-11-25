// @vitest-environment node
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createCloudField, cloudWaterAt } from '../components/simulator/world/cloudPhysics.js';
import { createCloudVolume } from '../components/simulator/world/cloudVolume.js';
import { buildSkyEnvironment } from '../components/simulator/world/SkyEnvironment.js';
import { ENVIRONMENT_DEFAULTS } from '../components/simulator/world/environmentMath.js';

vi.mock('../components/simulator/world/cityTextures.js', () => ({ glowTexture: () => new THREE.Texture() }));
const origin = new THREE.Vector3();
const calm = {speedMs:0, directionDeg:0};
const breeze = {speedMs:4, directionDeg:90};
const nearby = field => field.cells.find(cell => cell.level === 76);

it('advects toward compass bearings with height-dependent wind and no jump after a turn or pause', () => {
  const field = createCloudField(), c = nearby(field);
  field.update(0,breeze,0,origin);
  const upper = field.cells.find(cell=>cell.level>180 && Math.abs(cell.x)<700);
  const x = c.x, z = c.z, upperX = upper.x;
  field.update(5,breeze,0,origin);
  expect(c.x - x).toBeCloseTo(20);
  expect(c.z).toBeCloseTo(z);
  expect(upper.x - upperX).toBeGreaterThan(20);
  field.update(5,{speedMs:12,directionDeg:0},1,origin);
  expect(c.x).toBeCloseTo(x + 20);
  expect(c.z).toBeCloseTo(z);
  field.update(6,{speedMs:12,directionDeg:0},0,origin);
  expect(c.z).toBeCloseTo(z - 12);
  field.update(16,calm,0,origin);
  expect(c.z).toBeCloseTo(z - 12);
});

it('condenses above a lowering storm base, evaporates in subsiding air and agrees across frame rates', () => {
  const dry = createCloudField(), wet = createCloudField(), frequent = createCloudField();
  for (let tick=0; tick<=1200; tick++) frequent.update(tick/60,breeze,1,origin);
  dry.update(20,breeze,0,origin); wet.update(20,breeze,1,origin);
  const a = nearby(dry), b = nearby(wet), c = nearby(frequent);
  expect(b.y - b.radiusY).toBeLessThan(a.y - a.radiusY);
  expect(b.radiusY).toBeGreaterThan(a.radiusY);
  expect(b.opacity).toBeGreaterThan(a.opacity);
  for (const key of ['x','z','y','radiusX','radiusY','opacity']) expect(c[key]).toBeCloseTo(b[key],8);
  const lowPoint = (1.5*Math.PI - a.phase) / a.frequency;
  dry.update(lowPoint,breeze,0,origin);
  expect(a.opacity).toBe(0);
  wet.update(lowPoint,breeze,0,origin);
  expect(b.y - b.radiusY).toBeCloseTo(a.level,0);
});

it('keeps the cloud in world space as the camera moves and recycles it only at a faded edge', () => {
  const field = createCloudField(), c = nearby(field);
  field.update(0,calm,0,origin);
  const x = c.x, opacity = c.opacity;
  field.update(0,calm,0,new THREE.Vector3(130,100,0));
  expect(c.x).toBe(x); expect(c.opacity).toBe(opacity);
  field.update(0,calm,0,new THREE.Vector3(x+1349.99,100,0));
  expect(c.opacity).toBeLessThan(0.001);
  field.update(0,calm,0,new THREE.Vector3(x+1350.01,100,0));
  expect(c.x-x).toBeCloseTo(2700);
  expect(c.opacity).toBeLessThan(0.001);
});

it('samples the visible cloud shape in its rotated local frame and leaves clear air transparent', () => {
  const field = createCloudField(), volume = createCloudVolume(), c = nearby(field);
  field.update(0,calm,0,origin);
  const x=0.32, y=0.4, z=-0.04;
  const p = { x:c.x + c.cos*x*c.radiusX + c.sin*z*c.radiusZ, y:c.y+y*c.radiusY,
    z:c.z - c.sin*x*c.radiusX + c.cos*z*c.radiusZ };
  expect(volume.densityAt(x,y,z)).toBeGreaterThan(0);
  expect(cloudWaterAt([c],p,volume)).toBeCloseTo(c.opacity*volume.densityAt(x,y,z),8);
  expect(cloudWaterAt([c],origin,volume)).toBe(0);
  expect(cloudWaterAt([c],{...p,y:c.y+c.radiusY},volume)).toBe(0);
  expect(volume.densityAt(-1,0,0)).toBe(0);
});

it('applies interior visibility to land and water at the current camera, across quality settings and source changes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), sky = buildSkyEnvironment(scene);
  const settings = {...ENVIRONMENT_DEFAULTS,wind:calm};
  const weather = {rain:0,flash:0,thunder:0,strike:null};
  const field = createCloudField(); field.update(0,calm,0,origin);
  const core = nearby(field);
  sky.update(0,settings,camera,origin,weather);
  sky.updateCameraWeather(0,weather,'low',camera,true);
  const clear = scene.fog.density, mesh = scene.getObjectByName('Clouds');
  expect(mesh.isInstancedMesh).toBe(true);
  expect(mesh.count).toBeGreaterThan(0);
  expect(mesh.material.uniforms.steps.value).toBe(6);
  camera.position.set(core.x,core.y,core.z);
  sky.updateCameraWeather(0,weather,'high',camera,true);
  const interior = scene.fog.density;
  expect(interior).toBeGreaterThan(clear+0.01);
  expect(sky.ocean.material.uniforms.fogDensity.value).toBe(interior);
  expect(mesh.material.uniforms.steps.value).toBe(20);
  sky.updateCameraWeather(0,weather,'low',camera,true);
  expect(scene.fog.density).toBe(interior);
  sky.updateCameraWeather(0,weather,'low',camera,false);
  expect(mesh.visible).toBe(false); expect(scene.fog.density).toBe(clear);
  camera.position.y = 0;
  sky.updateCameraWeather(0,weather,'low',camera,true);
  expect(mesh.visible).toBe(true); expect(scene.fog.density).toBe(clear);
  const disposed = vi.fn();
  for (const resource of [mesh.geometry,mesh.material,mesh.material.uniforms.volume.value]) resource.addEventListener('dispose',disposed);
  sky.dispose(); expect(disposed).toHaveBeenCalledTimes(3);
});
