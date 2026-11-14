// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createChallengeGame, stepChallengeGame, pursuitPosition, hitsCar, DELIVERY_A, DELIVERY_B } from '../components/simulator/challengeGame.js';
import { createCameraRig } from '../components/simulator/cameraRig.js';
import { flightAxes, FLIGHT_KEYS } from '../components/simulator/flightKeys.js';
import { createExplosionEffects } from '../components/simulator/world/ExplosionEffects.js';
import { useChallengeStore } from '../store/slices/challenges.js';

const hover={x:0,y:10,z:0,speed:0};
function run(state,drone,seconds) {
  for(let i=0;i<Math.ceil(seconds/0.05);i++) state=stepChallengeGame(state,drone,0.05);
  return state;
}
beforeEach(()=>useChallengeStore.setState({active:null,results:{},lastOutcome:null,actionSerial:0}));

describe('pursuit challenge',()=>{
  it('requires takeoff and proximity before T can detonate the moving target',()=>{
    let state=createChallengeGame('pursuit');
    state=stepChallengeGame(state,{...hover,y:0},0.05,true);
    expect(state.detonated).toBe(false);
    state=stepChallengeGame(state,{...hover,x:-400},0.05,true);
    expect(state.status).toBe('running');expect(state.events).toEqual([]);
    const target=pursuitPosition(state.elapsed+0.05);
    state=stepChallengeGame(state,{...target,y:10,speed:11},0.05,true);
    expect(state.status).toBe('complete');expect(state.stage).toBe(3);
    expect(state.events).toHaveLength(1);expect(state.events[0].type).toBe('explosion');
    expect(stepChallengeGame(state,hover,0.05,true).events).toEqual([]);
  });
  it('keeps pursuit coordinates on city streets and fails after the time limit',()=>{
    for(let t=0;t<300;t+=0.25) {
      const car=pursuitPosition(t);
      expect([car.x,car.z,car.yaw].every(Number.isFinite)).toBe(true);
      expect(car.x).toBeGreaterThanOrEqual(62);expect(car.x).toBeLessThanOrEqual(428);
      expect(car.z).toBeGreaterThanOrEqual(-603);expect(car.z).toBeLessThanOrEqual(363);
    }
    const state=run(createChallengeGame('pursuit'),hover,181);
    expect(state.status).toBe('failed');expect(state.message).toContain('escaped');
  });
  it('does not move the target or advance delivery while paused',()=>{
    const state=run(createChallengeGame('pursuit'),hover,4);
    const paused=stepChallengeGame(state,hover,0);
    expect(paused.target).toEqual(state.target);expect(paused.elapsed).toBe(state.elapsed);
    expect(stepChallengeGame(state,{...state.target,y:10,speed:0},0,true).detonated).toBe(false);
    expect(run(createChallengeGame('parcel-delivery'),{...DELIVERY_A,speed:0},0).stage).toBe(0);
  });
});

describe('parcel delivery',()=>{
  it('loads at A, requires landing at B and animates collection before completion',()=>{
    let state=run(createChallengeGame('parcel-delivery'),{...DELIVERY_A,speed:0},1.1);
    expect(state.stage).toBe(1);expect(state.carrying).toBe(true);
    state=run(state,{...DELIVERY_B,y:10,speed:0},2);
    expect(state.stage).toBe(1);
    state=run(state,{...DELIVERY_B,speed:0},1.6);
    expect(state.stage).toBe(2);expect(state.carrying).toBe(true);
    const firstX=state.recipient.x;
    state=run(state,{...DELIVERY_B,speed:0},2);
    expect(state.recipient.x).toBeLessThan(firstX);expect(state.status).toBe('running');
    state=run(state,{...DELIVERY_B,speed:0},15);
    expect(state.status).toBe('complete');expect(state.carrying).toBe(false);expect(state.phase).toBe('depart');
  });
  it('resets the approach if the drone takes off before handoff',()=>{
    let state=run(createChallengeGame('parcel-delivery'),{...DELIVERY_A,speed:0},1.1);
    state=run(state,{...DELIVERY_B,speed:0},3);
    expect(state.stage).toBe(2);
    state=stepChallengeGame(state,{...DELIVERY_B,y:3,speed:0},0.05);
    expect(state.stage).toBe(1);expect(state.collection).toBe(0);expect(state.carrying).toBe(true);
  });
  it('does not count fast passes or landings outside the delivery ring',()=>{
    let state=run(createChallengeGame('parcel-delivery'),{...DELIVERY_A,speed:0},1.1);
    state=run(state,{...DELIVERY_B,speed:8},5);
    state=run(state,{...DELIVERY_B,x:DELIVERY_B.x+10,speed:0},5);
    expect(state.stage).toBe(1);expect(state.hold).toBe(0);
  });
});

describe('traffic impacts and recovery',()=>{
  const car={x:10,y:0,z:0,yaw:0,halfWidth:1,halfLength:2,height:1.7,active:true};
  it('detects a moving car crossing a stationary drone and fast drone crossings',()=>{
    expect(hitsCar({x:10,y:0,z:0},{x:10,y:0,z:0},{...car,x:15,previous:{x:5,z:0}})).toBe(true);
    expect(hitsCar({x:0,y:0,z:0},{x:20,y:0,z:0},car)).toBe(true);
    expect(hitsCar({x:10,y:4,z:0},{x:10,y:4,z:0},car)).toBe(false);
    expect(hitsCar({x:0,y:0,z:0},{x:20,y:0,z:0},{...car,destroyed:true})).toBe(false);
  });
  it('honours car orientation and ignores inactive traffic',()=>{
    expect(hitsCar({x:12,y:0,z:0},{x:12,y:0,z:0},{...car,yaw:Math.PI/2})).toBe(true);
    expect(hitsCar({x:12,y:0,z:0},{x:12,y:0,z:0},car)).toBe(false);
    expect(hitsCar({x:10,y:0,z:0},{x:10,y:0,z:0},{...car,active:false})).toBe(false);
  });
  it('stores success once, rejects stale runs, and leaves failed attempts incomplete',()=>{
    const store=useChallengeStore.getState();store.startChallenge('pursuit');
    const runId=useChallengeStore.getState().active.runId;
    store.updateGame({...createChallengeGame('pursuit'),status:'complete',elapsed:12},'stale');
    expect(useChallengeStore.getState().results).toEqual({});
    store.updateGame({...createChallengeGame('pursuit'),status:'complete',elapsed:12},runId);
    expect(useChallengeStore.getState().results.pursuit.score).toBe(100);
    store.startChallenge('parcel-delivery');store.finishGame('failed','Vehicle collision',3);
    expect(useChallengeStore.getState().results['parcel-delivery']).toBeUndefined();
    expect(useChallengeStore.getState().lastOutcome.status).toBe('failed');
    store.startChallenge('parcel-delivery');expect(useChallengeStore.getState().lastOutcome).toBeNull();
  });
  it('bounds explosion bursts, advances fragments and releases effects',()=>{
    const scene=new THREE.Scene(),effects=createExplosionEffects(scene);
    for(let i=0;i<10;i++) effects.explode({x:i,y:2,z:0},1,true);
    expect(scene.children[0].children).toHaveLength(6);
    const part=scene.children[0].children[0].children[0];
    effects.update(0.1);expect(part.position.length()).toBeGreaterThan(0);
    for(let i=0;i<60;i++) effects.update(0.1);
    expect(scene.children[0].children).toHaveLength(0);
    effects.dispose();expect(scene.children).toHaveLength(0);
  });
});

describe('camera switching and keyboard mapping',()=>{
  function rig() {
    const camera=new THREE.PerspectiveCamera(60,1.6,0.08,20000);
    const controls={target:new THREE.Vector3(),update:vi.fn()};
    const aircraft=new THREE.Group();aircraft.position.set(10,20,30);aircraft.rotation.set(-0.1,0.8,0.05,'YXZ');
    return {camera,controls,controller:createCameraRig(camera,controls),frame:{position:new THREE.Vector3(10,19.5,30),aircraft,yaw:0.8,grounded:false,payload:{fov:75,tilt:0},delta:0}};
  }
  it('switches directly from top to FPV even when simulation delta is zero',()=>{
    const {camera,controller,frame}=rig();controller.update({...frame,mode:'top'});
    expect(camera.up.toArray()).toEqual([0,0,-1]);
    controller.update({...frame,mode:'fpv'});
    expect(camera.up.toArray()).toEqual([0,1,0]);
    expect(camera.quaternion.angleTo(frame.aircraft.quaternion)).toBeLessThan(1e-6);
    expect(camera.position.distanceTo(frame.aircraft.position)).toBeLessThan(1);
    expect(camera.fov).toBe(75);
  });
  it('applies camera tilt, restores normal FOV and enables orbit only in free view',()=>{
    const {camera,controls,controller,frame}=rig();frame.aircraft.quaternion.identity();
    controller.update({...frame,mode:'fpv',payload:{fov:90,tilt:45}});
    expect(camera.getWorldDirection(new THREE.Vector3()).y).toBeLessThan(-0.7);
    for(const mode of ['side','free','chase','top']) {
      controller.update({...frame,mode});expect(camera.fov).toBe(60);
      expect(controls.enabled).toBe(mode==='free');
      expect(camera.position.distanceTo(frame.position)).toBeGreaterThan(5);
      expect(camera.quaternion.toArray().every(Number.isFinite)).toBe(true);
    }
  });
  it('keeps Q/E unbound, A/D yaw, and arrow pitch directions',()=>{
    expect(flightAxes(new Set(['KeyQ','KeyE'])).yaw).toBe(0);
    expect(FLIGHT_KEYS).not.toContain('KeyQ');expect(FLIGHT_KEYS).not.toContain('KeyE');
    expect(flightAxes(new Set(['KeyA'])).yaw).toBe(-1);
    expect(flightAxes(new Set(['KeyD'])).yaw).toBe(1);
    expect(flightAxes(new Set(['ArrowUp'])).pitch).toBe(1);
    expect(flightAxes(new Set(['ArrowDown'])).pitch).toBe(-1);
  });
});
