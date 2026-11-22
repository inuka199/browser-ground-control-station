// @vitest-environment node
import * as THREE from 'three';
import { expect, it, vi } from 'vitest';
import { createStormClock } from '../components/simulator/world/stormClock.js';
import { buildSkyEnvironment } from '../components/simulator/world/SkyEnvironment.js';
import { ENVIRONMENT_DEFAULTS } from '../components/simulator/world/environmentMath.js';
import { seededRandom } from '../components/simulator/world/sceneUtils.js';
vi.mock('../components/simulator/world/cityTextures.js', () => ({ glowTexture: () => new THREE.Texture() }));

it('starts clear, ramps up a shower, fades it out and returns to a dry interval', () => {
  const sample = createStormClock(() => 0);
  expect(sample(0).rain).toBe(0);
  expect(sample(44.9).rain).toBe(0);
  expect(sample(47.5).rain).toBeCloseTo(0.5);
  expect(sample(57).rain).toBe(1);
  expect(sample(67.5).rain).toBeCloseTo(0.5);
  for (const time of [70, 95, 159]) expect(sample(time)).toMatchObject({rain:0, flash:0, thunder:0, strike:null});
  expect(sample(163).rain).toBeGreaterThan(0);
});

it('emits one bolt, then delayed thunder, on simulation time and honours reduced motion and clear overrides', () => {
  const sample = createStormClock(() => 0);
  sample(0, 'storm');
  const strike = sample(5, 'storm');
  expect(strike.flash).toBe(1); expect(strike.thunder).toBe(0);
  expect(sample(5, 'storm')).toEqual(strike);
  expect(sample(5, 'storm', true)).toMatchObject({flash:0, rain:1});
  expect(sample(5.46,'storm').flash).toBe(0);
  expect(sample(7,'storm',true).thunder).toBeGreaterThan(0);
  expect(sample(10,'storm').thunder).toBe(0);
  expect(sample(15,'storm').flash).toBe(1);
  expect(sample(15,'clear')).toMatchObject({flash:0, thunder:0, rain:0});
  expect(sample(35,'auto').rain).toBe(0);
});

it('keeps the same storm schedule across frame rates and long gaps', () => {
  const sparse=createStormClock(seededRandom(34)), frequent=createStormClock(seededRandom(34));
  sparse(0);frequent(0);
  for(let t=1;t<=1000;t++){
    const expected=frequent(t);
    if(t%17===0)expect(sparse(t)).toEqual(expected);
  }
});

it('renders bounded camera-local rain and a world-fixed bolt, then restores clear lighting and releases buffers', () => {
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera();
  camera.position.set(0,6,7);
  const sky=buildSkyEnvironment(scene), sample=createStormClock(()=>0);
  const settings={...ENVIRONMENT_DEFAULTS,quality:'low'}, focus=new THREE.Vector3();
  function draw(time,mode) {
    const w=sample(time,mode);
    sky.update(time,settings,camera,focus,w);
    sky.updatePrecipitation(time,w,settings.quality,camera);
  }
  draw(0,'storm');
  const dryFog=scene.fog.density;
  const rain=scene.getObjectByName('Rain'), bolt=scene.getObjectByName('Lightning');
  expect(rain.visible).toBe(false);
  draw(5,'storm');expect(bolt.visible).toBe(true);expect(rain.visible).toBe(true);
  const anchor=bolt.position.clone(), positions=rain.geometry.getAttribute('position');
  const frozen=positions.array.slice();draw(5,'storm');expect(positions.array).toEqual(frozen);
  camera.position.set(170,130,-900);draw(5.1,'storm');expect(bolt.position).toEqual(anchor);
  expect(scene.fog.density).toBeGreaterThan(dryFog);
  expect(rain.geometry.drawRange.count).toBe(600);
  for(let i=0;i<600;i++){
    expect(Math.abs(positions.getX(i)-camera.position.x)).toBeLessThan(23);
    expect(Math.abs(positions.getY(i)-camera.position.y)).toBeLessThan(15);
    expect(Math.abs(positions.getZ(i)-camera.position.z)).toBeLessThan(23);
  }
  settings.quality='high';draw(7,'storm');
  expect(rain.geometry.drawRange.count).toBe(2400);expect(bolt.visible).toBe(false);
  draw(7,'clear');expect(scene.fog.density).toBe(dryFog);expect(rain.visible).toBe(false);
  const released=vi.fn();rain.geometry.addEventListener('dispose',released);bolt.geometry.addEventListener('dispose',released);
  sky.dispose();expect(released).toHaveBeenCalledTimes(2);expect(scene.children).toHaveLength(0);
});
