// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createHoldAction } from '../components/simulator/holdAction.js';
import { oceanGeometry } from '../components/simulator/world/OceanSurface.js';
import { buildCityLife } from '../components/simulator/world/CityLife.js';
import { disposeObject } from '../components/simulator/world/sceneUtils.js';
vi.mock('../components/simulator/world/cityTextures.js',()=>({glowTexture:()=>new THREE.Texture()}));

it('detonates once at 1 second, not on repeats, and keeps a short tap action',()=>{
  const hold=vi.fn(),tap=vi.fn(),action=createHoldAction(hold,tap);
  action.begin(100);action.begin(800);action.tick(1099);expect(hold).not.toHaveBeenCalled();
  expect(action.tick(1100)).toBe(1);action.tick(4000);action.release(4500);
  expect(hold).toHaveBeenCalledTimes(1);expect(tap).not.toHaveBeenCalled();
  action.begin(5000);action.release(5200);expect(tap).toHaveBeenCalledTimes(1);
});
it('cancels the hold on pause, blur or form focus without firing later',()=>{
  const hold=vi.fn(),tap=vi.fn(),action=createHoldAction(hold,tap);
  action.begin(0);action.tick(900);action.cancel();action.release(2000);action.tick(5000);
  expect(hold).not.toHaveBeenCalled();expect(tap).not.toHaveBeenCalled();
});
it('uses 3D blast distance and animates nearby pedestrians without affecting distant actors',()=>{
  const life=buildCityLife(),options={cityLife:true,quality:'balanced'},solar={night:0};
  life.update(0,0,solar,options);
  const person=life.people[0],before={x:person.x,z:person.z};
  life.blast({...person,y:100},18);expect(person.impact).toBeUndefined();
  life.blast({x:person.x-1,y:1,z:person.z},3);expect(person.impact).toBeTruthy();
  expect(life.people.filter(p=>p.impact).length).toBeLessThan(10);
  life.update(0.4,0.4,solar,options);expect(person.x).not.toBe(before.x);
  life.resetTraffic();expect(person.impact).toBeNull();expect(person.x).toBe(before.x);
  const car=life.traffic[0];life.blast({...car,y:100},18);expect(car.destroyed).toBe(false);
  disposeObject(life.group);
});
it('provides a continuous finite water mesh with a horizon for every quality level',()=>{
  let lastCount=0;
  for(const quality of ['low','balanced','high']) {
    const geometry=oceanGeometry(quality),position=geometry.attributes.position;
    expect(position.count).toBeGreaterThan(lastCount);lastCount=position.count;
    expect([...position.array].every(Number.isFinite)).toBe(true);
    geometry.computeBoundingBox();expect(geometry.boundingBox.min.x).toBeLessThan(-10000);
    const index=geometry.index.array;
    let minimumNormal=Infinity;
    for(let i=0;i<index.length;i+=3) {
      const a=new THREE.Vector3().fromBufferAttribute(position,index[i]);
      const b=new THREE.Vector3().fromBufferAttribute(position,index[i+1]);
      const c=new THREE.Vector3().fromBufferAttribute(position,index[i+2]);
      minimumNormal=Math.min(minimumNormal,b.sub(a).cross(c.sub(a)).y);
    }
    expect(minimumNormal).toBeGreaterThan(0);
    geometry.dispose();
  }
});
