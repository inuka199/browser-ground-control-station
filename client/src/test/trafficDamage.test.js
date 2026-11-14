// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildCityLife } from '../components/simulator/world/CityLife.js';
import { disposeObject } from '../components/simulator/world/sceneUtils.js';
vi.mock('../components/simulator/world/cityTextures.js',()=>({glowTexture:()=>new THREE.Texture()}));

it('stops and darkens cars in the blast radius, excludes distant cars and resets a new attempt',()=>{
  const life=buildCityLife(),options={cityLife:true,quality:'balanced'},solar={night:0};
  life.update(0,0,solar,options);
  const car=life.traffic[0],before={x:car.x,z:car.z};
  const hit=life.blast({...car,y:1},3);
  expect(hit).toHaveLength(1);expect(car.destroyed).toBe(true);
  expect(life.traffic.filter(item=>item.destroyed)).toHaveLength(1);
  life.update(1,1,solar,options);
  expect({x:car.x,z:car.z}).toEqual(before);
  expect(life.blast({...car,y:1},3)).toEqual([]);
  life.resetTraffic();life.update(2,1,solar,options);
  expect(car.destroyed).toBe(false);expect({x:car.x,z:car.z}).not.toEqual(before);
  life.update(3,1,solar,{...options,cityLife:false});
  expect(life.traffic.every(item=>!item.active)).toBe(true);
  disposeObject(life.group);
});
