import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { solarState, advanceTime, formatWorldTime, ENVIRONMENT_DEFAULTS } from '../components/simulator/world/environmentMath.js';
import { useEnvironmentStore } from '../store/slices/environment.js';
import { DRONE_MODELS, animateDroneRotors } from '../components/simulator/models/droneModels.js';
import { trafficRoute, buildCityLife } from '../components/simulator/world/CityLife.js';
import { buildProceduralWorld } from '../components/simulator/world/ProceduralWorld.js';
import { distanceToBox } from '../components/simulator/buildingCollision.js';
import { disposeObject } from '../components/simulator/world/sceneUtils.js';

describe('world clock and lighting', () => {
  beforeEach(() => useEnvironmentStore.setState(ENVIRONMENT_DEFAULTS));
  it('lights the day, darkens the night and transitions continuously across midnight', () => {
    expect(solarState(12).daylight).toBe(1);
    expect(solarState(12).night).toBe(0);
    expect(solarState(0).night).toBe(1);
    expect(solarState(6).daylight).toBeGreaterThan(0);
    expect(solarState(6).daylight).toBeLessThan(1);
    expect(solarState(23.999).elevation).toBeCloseTo(solarState(0.001).elevation);
    expect(solarState(17.3).golden).toBeGreaterThan(solarState(12).golden);
  });
  it('wraps midnight and advances at the same rate for different frame sizes', () => {
    expect(advanceTime(23,60,8)).toBe(2);
    let hour=16;
    for(let i=0;i<600;i++) hour=advanceTime(hour,1/60,8);
    expect(hour).toBeCloseTo(advanceTime(16,10,8));
    expect(formatWorldTime(24)).toBe('00:00');
    expect(formatWorldTime(17.5)).toBe('17:30');
    expect(formatWorldTime(17.3)).toBe('17:18');
  });
  it('keeps a fixed preset unless cycling is enabled and never advances with zero delta', () => {
    const store=useEnvironmentStore.getState();
    store.setTimeOfDay(22); store.advanceClock(30); expect(useEnvironmentStore.getState().timeOfDay).toBe(22);
    store.setCycleEnabled(true); store.advanceClock(0); expect(useEnvironmentStore.getState().timeOfDay).toBe(22);
    store.advanceClock(60); expect(useEnvironmentStore.getState().timeOfDay).toBe(1);
    store.setTimeOfDay(NaN); store.setQuality('invalid'); store.setHaze(2);
    expect(useEnvironmentStore.getState().timeOfDay).toBe(1);
    expect(useEnvironmentStore.getState().quality).toBe('balanced');
    expect(useEnvironmentStore.getState().haze).toBe(1);
  });
});

describe('aircraft models', () => {
  it.each(DRONE_MODELS)('$name has grounded clearance and a complete motor assembly', model => {
    const aircraft=model.build();
    expect(aircraft.rotorMeshes).toHaveLength(model.specs.motors);
    aircraft.group.position.y=aircraft.groundClearance;
    const bounds=new THREE.Box3().setFromObject(aircraft.group);
    expect(bounds.min.y).toBeCloseTo(0.08);
    expect(bounds.max.x-bounds.min.x).toBeGreaterThan(1);
    const rotor=aircraft.rotorMeshes[0];
    animateDroneRotors(aircraft.rotorMeshes,1,false); expect(rotor.rotation.y).toBe(0);
    animateDroneRotors(aircraft.rotorMeshes,0.5,true); const angle=rotor.rotation.y;
    rotor.rotation.y=0;
    for(let i=0;i<30;i++) animateDroneRotors(aircraft.rotorMeshes,1/60,true);
    expect(rotor.rotation.y).toBeCloseTo(angle);
    expect(rotor.userData.blur.material.opacity).toBeGreaterThan(0);
    aircraft.dispose();
  });
});

describe('city layout and activity', () => {
  beforeEach(() => {
    // Canvas painting is a browser concern; the actual geometry and layout run here.
    const gradient={addColorStop:vi.fn()};
    vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({
      fillRect:vi.fn(),strokeRect:vi.fn(),fillText:vi.fn(),beginPath:vi.fn(),arc:vi.fn(),stroke:vi.fn(),setLineDash:vi.fn(),ellipse:vi.fn(),fill:vi.fn(),
      createLinearGradient:()=>gradient,createRadialGradient:()=>gradient,
    });
  });
  afterEach(()=>vi.restoreAllMocks());
  it('keeps both closed traffic lanes on the street surface, including corners', () => {
    for(const inset of [-3,3]) {
      const route=trafficRoute(inset);
      expect(route.getPointAt(0).distanceTo(route.getPointAt(1))).toBeLessThan(0.001);
      for(let i=0;i<=200;i++) {
        const p=route.getPointAt(i/200);
        const streetDistance=Math.min(Math.abs(p.x-65),Math.abs(p.x-425),Math.abs(p.z+600),Math.abs(p.z-360));
        expect(streetDistance).toBeLessThan(7.1);
        expect(p.y).toBe(0);
      }
    }
  });
  it('moves vehicles and walkers, freezes them with zero delta, and can hide activity', () => {
    const life=buildCityLife(), solar=solarState(12), options={...ENVIRONMENT_DEFAULTS};
    life.update(0,0,solar,options);
    const body=life.group.children[0], before=body.instanceMatrix.array.slice();
    life.update(1,1,solar,options);
    expect(body.instanceMatrix.array).not.toEqual(before);
    const moving=body.instanceMatrix.array.slice();
    life.update(1,0,solar,options); expect(body.instanceMatrix.array).toEqual(moving);
    life.update(1,0,solar,{...options,cityLife:false}); expect(life.group.visible).toBe(false);
    disposeObject(life.group);
  });
  it('reserves every landing pad and keeps building collisions separate from merged scenery', () => {
    const city=buildProceduralWorld();
    expect(city.buildingBoxes.length).toBeGreaterThan(200);
    for(const pad of city.padPositions) {
      const clearance=Math.min(...city.buildingBoxes.map(box=>distanceToBox({x:pad.x,y:0,z:pad.z},box)));
      expect(clearance).toBeGreaterThan(7);
    }
    city.group.traverse(object=>{
      if(object.geometry) expect([...object.geometry.attributes.position.array].every(Number.isFinite)).toBe(true);
    });
    city.dispose();
  });
});
