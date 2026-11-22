// @vitest-environment node
import * as THREE from 'three';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { buildCityLife } from '../components/simulator/world/CityLife.js';
import { disposeObject } from '../components/simulator/world/sceneUtils.js';
import { streetSources } from '../components/simulator/streetAudio.js';
import { sampleSwell, oceanGeometry, waterVertex } from '../components/simulator/world/OceanSurface.js';

vi.mock('../components/simulator/world/cityTextures.js', () => ({glowTexture: () => new THREE.Texture()}));

let life;
function draw(quality, delta = 0, cityLife = true) {
  life.update(delta, delta, {night: 0}, {quality, cityLife});
}
beforeEach(() => { life = buildCityLife(); });
afterEach(() => disposeObject(life.group));

it.each([['low', 20], ['balanced', 40], ['high', 40]])('draws the whole fleet mix on %s with matching footprints', (quality, count) => {
  draw(quality);
  const active = life.traffic.filter(v => v.active);
  expect(active).toHaveLength(count);
  expect(new Set(active.map(v => v.kind))).toEqual(new Set(['sedan','bus','deliveryVan','tukTuk','pickup']));
  const tyres = life.group.getObjectByName('Traffic tyre');
  const world = new THREE.Matrix4(), relative = new THREE.Matrix4();
  let wheel = 0;
  for (const v of active) {
    const toLocal = new THREE.Matrix4().makeRotationY(v.yaw).setPosition(v.x, 0, v.z).invert();
    const wheels = [];
    const expectedWheels = v.kind === 'tukTuk' ? 3 : 4;
    for (let i = 0; i < expectedWheels; i++) {
      tyres.getMatrixAt(wheel++, world);
      relative.multiplyMatrices(toLocal, world);
      const bounds = new THREE.Box3().setFromBufferAttribute(tyres.geometry.attributes.position).applyMatrix4(relative);
      expect(bounds.min.y).toBeCloseTo(0, 4);
      expect(bounds.max.y).toBeLessThan(v.height);
      expect(Math.max(bounds.max.z, -bounds.min.z)).toBeLessThanOrEqual(v.halfLength + 0.001);
      expect(Math.max(bounds.max.x, -bounds.min.x)).toBeLessThanOrEqual(v.halfWidth + 0.001);
      wheels.push(new THREE.Vector3().setFromMatrixPosition(relative));
    }
    if (v.kind === 'tukTuk') {
      const front = wheels.filter(p => p.z > 0);
      expect(front).toHaveLength(1);
      expect(front[0].x).toBeCloseTo(0, 4);
    }
  }
  expect(tyres.count).toBe(wheel);
  const shape = Object.fromEntries(active.map(v => [v.kind, v]));
  expect(shape.bus.height).toBeGreaterThan(shape.deliveryVan.height);
  expect(shape.deliveryVan.height).toBeGreaterThan(shape.sedan.height);
  expect(shape.tukTuk.halfWidth).toBeLessThan(shape.sedan.halfWidth);
});

it('restores traffic after a quality change or hide without sweeping through invisible positions', () => {
  draw('high');
  draw('low', 1);
  const hidden = life.traffic[30];
  expect(hidden.active).toBe(false);
  draw('high', 1);
  expect(hidden.previous).toEqual({x:hidden.x, z:hidden.z});
  draw('high', 0, false);
  expect(life.traffic.every(v => !v.active)).toBe(true);
  draw('high', 1);
  expect(life.traffic.every(v => v.previous.x === v.x && v.previous.z === v.z)).toBe(true);
  life.resetTraffic();
  draw('high');
  expect(life.traffic.every(v => v.previous.x === v.x && v.previous.z === v.z)).toBe(true);
});

it('uses actor distance in 3D and camera orientation for stereo, including a silent empty street',()=>{
  const cam=new THREE.PerspectiveCamera();cam.position.set(0,1.5,0);cam.updateMatrixWorld();
  const person={id:1,x:10,z:0,active:true}, car={id:2,x:-15,z:0,active:true};
  const samples=()=>streetSources(cam,[{...person,x:1,impact:{}},person],[{...car,x:1,destroyed:true},car]);
  let s=samples();expect(s.person.actor).toBe(person);expect(s.vehicle.actor).toBe(car);
  expect(s.person.pan).toBeGreaterThan(0.99);expect(s.vehicle.pan).toBeLessThan(-0.99);
  const before=s.person.gain;
  cam.position.x=4;cam.rotation.y=Math.PI;cam.updateMatrixWorld();
  s=samples();expect(s.person.pan).toBeLessThan(-0.99);expect(s.person.gain).toBeGreaterThan(before);
  cam.position.y=100;cam.updateMatrixWorld();
  expect(samples()).toEqual({person:null,vehicle:null});
});

it('varies gait and displays a brief clothing stain only while an existing impact is recent',()=>{
  draw('balanced');
  expect(new Set(life.people.map(p=>p.style)).size).toBe(3);
  const marks=life.group.getObjectByName('Clothing stains'),person=life.people[0];
  expect(marks.count).toBe(0);
  person.impact={age:0,vx:0,vz:0,originalX:person.x,originalZ:person.z};
  draw('balanced',0.1); expect(marks.count).toBe(1); expect(person.walking).toBe(false);
  const m=new THREE.Matrix4();marks.getMatrixAt(0,m);expect(m.determinant()).toBeGreaterThan(0);
  draw('balanced',0);expect(person.impact.age).toBeCloseTo(0.1);
  draw('balanced',3,false);draw('balanced');expect(marks.count).toBe(0);
  life.resetTraffic();draw('balanced');expect(marks.count).toBe(0);expect(person.walking).toBe(true);
});

it('illuminates brake lights when slowing for a corner and extinguishes them when accelerating',()=>{
  draw('balanced');
  const brake=life.group.getObjectByName('Traffic brake'),matrix=new THREE.Matrix4();
  let slowing=false,accelerating=false;
  for(let i=0;i<12;i++){
    draw('balanced',0.15);
    for(const car of life.traffic){
      brake.getMatrixAt(car.id*2,matrix);
      if(car.acceleration < -0.3){slowing=true;expect(matrix.determinant()).toBeGreaterThan(0);}
      if(car.acceleration > 0.3){accelerating=true;expect(matrix.determinant()).toBe(0);}
    }
  }
  expect(slowing && accelerating).toBe(true);
});

it('displaces swells on three axes, shelters the docks and freezes water at a fixed simulation time',()=>{
  const wave=sampleSwell(-660,-420,7);
  expect(wave).toEqual(sampleSwell(-660,-420,7));
  expect(Math.abs(wave.dx)).toBeGreaterThan(0.01);expect(Math.abs(wave.dz)).toBeGreaterThan(0.01);
  expect(sampleSwell(-660,-420,8).y).not.toBeCloseTo(wave.y);
  const peak=(x,z)=>Math.max(...Array.from({length:200},(_,i)=>Math.abs(sampleSwell(x,z,i/4).y)));
  expect(peak(-660,-420)).toBeGreaterThan(1);expect(peak(-477,-400)).toBeLessThan(0.32);
  expect(peak(0,0)-0.9).toBeLessThan(0);
  const geometry=oceanGeometry('low'),weights=geometry.getAttribute('swellWeight');
  expect(weights.count).toBe(geometry.getAttribute('position').count);
  expect(waterVertex).toContain('swell(vec2(');
  expect(waterVertex).not.toMatch(/\$\{/);
  geometry.dispose();
});
