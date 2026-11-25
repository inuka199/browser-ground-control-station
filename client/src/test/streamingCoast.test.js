// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { buildStreamingCoast } from '../components/simulator/world/StreamingCoast.js';
import { coastX, groundAt, landmarkAt, launchGuide, settleOnTerrain, viewRange } from '../components/simulator/world/coastalTerrain.js';
import { buildOpenOcean } from '../components/simulator/world/OceanSurface.js';
import { buildSkyEnvironment } from '../components/simulator/world/SkyEnvironment.js';
import { createStormClock } from '../components/simulator/world/stormClock.js';
import { ENVIRONMENT_DEFAULTS } from '../components/simulator/world/environmentMath.js';
import { stepFlight } from '../components/simulator/flightDynamics.js';
vi.mock('../components/simulator/world/cityTextures.js',()=>({glowTexture:()=>new THREE.Texture()}));

it('flies 40 km inland, lands on the rendered triangle at a remote hillside, and takes off again',()=>{
  let flight={x:0,y:900,z:4300.3,yaw:0,grounded:false};
  const east={roll:1};
  for(let n=0;n<40000;n++) flight=settleOnTerrain(stepFlight(flight,east,0.05));
  expect(flight.x).toBe(40000);
  for(let n=0;n<2500;n++) flight=settleOnTerrain(stepFlight(flight,{throttle:-1},0.05));
  expect(flight.grounded).toBe(true);
  const world=buildStreamingCoast();
  world.update(flight,'low'); world.group.updateMatrixWorld(true);
  const down=new THREE.Raycaster(new THREE.Vector3(flight.x,1000,flight.z),new THREE.Vector3(0,-1,0));
  const surface=down.intersectObjects([...world.tiles.values()])[0].point.y;
  expect(surface).toBeGreaterThan(2);
  expect(flight.y).toBeCloseTo(surface,4);
  expect(settleOnTerrain(stepFlight(flight,{throttle:1},0.05)).y).toBeGreaterThan(surface);
  world.dispose();
});

it('releases distant tiles and recreates their heights, roads and landmark after a return',()=>{
  const world=buildStreamingCoast(), site=landmarkAt(2,1);
  world.update(site,'balanced'); world.updateLandmarks(site);
  const key=[...world.tiles.keys()].find(id=>id.startsWith('256/'));
  const original=world.tiles.get(key);
  const heights=original.geometry.attributes.position.array.slice(), roads=original.geometry.attributes.roads.array.slice();
  const disposed=vi.fn(); original.geometry.addEventListener('dispose',disposed);
  const away={x:1e8+0.25,y:100,z:-1e8+0.5};
  world.update(away,'low'); world.updateLandmarks(away);
  expect(disposed).toHaveBeenCalledOnce(); expect(world.landmarks.has(site.name)).toBe(false);
  const local=[...world.tiles.values()].find(mesh=>mesh.position.x<=away.x && mesh.position.x+256>away.x && mesh.position.z<=away.z && mesh.position.z+256>away.z);
  expect(local).toBeDefined();
  const c=new THREE.PerspectiveCamera();c.position.set(away.x,away.y,away.z);c.updateMatrixWorld();local.updateMatrixWorld();
  const mv=new THREE.Matrix4().multiplyMatrices(c.matrixWorldInverse,local.matrixWorld);
  expect(Math.fround(mv.elements[12])).toBe(local.position.x-away.x);
  world.update(site,'high');world.updateLandmarks(site);
  expect(world.tiles.get(key).geometry.attributes.position.array).toEqual(heights);
  expect(world.tiles.get(key).geometry.attributes.roads.array).toEqual(roads);
  expect(world.landmarks.get(site.name).site).toEqual(site);
  const count=world.tiles.size; world.update(site,'high'); expect(world.tiles.size).toBe(count);
  world.dispose(); expect(world.group.children).toHaveLength(0);
});

it('covers sea and land below a camera at 20 km, with clear-air visibility and denser storm haze',()=>{
  const scene=new THREE.Scene(), camera=new THREE.PerspectiveCamera(), sky=buildSkyEnvironment(scene);
  const sea=buildOpenOcean(sky.ocean), coast=buildStreamingCoast(), weather=createStormClock(()=>0);
  camera.position.set(-300,20000,4600);
  const reach=viewRange(camera.position.y);camera.far=4*2**Math.ceil(Math.log2(reach));
  coast.update(camera.position,'low');sea.update(camera.position,'low',3*2**Math.ceil(Math.log2(reach)));
  const bounds=new THREE.Box3().setFromObject(sea.mesh);
  expect(bounds.min.x).toBeLessThan(camera.position.x-reach);expect(bounds.max.z).toBeGreaterThan(camera.position.z+reach);
  expect([...coast.tiles.values()].some(tile=>tile.position.x>camera.position.x+reach/2)).toBe(true);
  function draw(t,mode){
    const w=weather(t,mode);
    sky.update(t,ENVIRONMENT_DEFAULTS,camera,camera.position,w);
    sky.updateCameraWeather(t,w,'low',camera,true,reach);
    return scene.fog.density;
  }
  const clear=draw(0,'clear'), storm=draw(0,'storm');
  expect(draw(5,'storm')).toBeGreaterThan(storm);
  const cloud=scene.getObjectByName('Clouds');
  const frozen=cloud.instanceMatrix.array.slice();draw(5,'storm');
  expect(cloud.instanceMatrix.array).toEqual(frozen);
  draw(6,'storm'); expect(cloud.instanceMatrix.array).not.toEqual(frozen);
  expect(Math.exp(-((clear*camera.position.y)**2))).toBeGreaterThan(0.8);
  expect(clear*reach).toBeGreaterThanOrEqual(3);
  sea.dispose();coast.dispose();sky.dispose();
});

it('retains the wave phase when ocean geometry recentres and points to the actual chosen launch pad',()=>{
  const sea=buildOpenOcean(new THREE.Mesh(undefined,new THREE.ShaderMaterial()));
  const phase=x=>{
    sea.update({x,y:0,z:50000},'low',24000);
    return sea.mesh.material.uniforms.wavePhase.value.x;
  };
  const a=phase(15.5), b=phase(16.5);
  const travel=2*Math.PI/92*0.93/Math.hypot(0.93,0.37)*32;
  expect(Math.sin(a+travel)).toBeCloseTo(Math.sin(b),8);
  const pad={x:-250,z:-395};
  const guide=launchGuide({x:pad.x+20000,z:pad.z,yaw:-Math.PI/2},pad);
  expect(guide).toMatchObject({distance:20000,bearing:270,turn:-180});
  expect(groundAt(pad.x,pad.z)).toBe(0);
  expect(coastX(0)).toBe(-140);
  sea.dispose();
});

it('streams an offshore island with a landable summit and a visible beacon',()=>{
  const beacon=landmarkAt(-2,0), world=buildStreamingCoast();
  expect(beacon.x).toBeLessThan(coastX(beacon.z)-1700);
  world.update(beacon,'low');world.updateLandmarks(beacon);world.group.updateMatrixWorld(true);
  const down=new THREE.Raycaster(new THREE.Vector3(beacon.x,1000,beacon.z),new THREE.Vector3(0,-1,0));
  const y=down.intersectObjects([...world.tiles.values()])[0].point.y;
  expect(y).toBeGreaterThan(20);
  expect(y).toBeCloseTo(beacon.y,4);
  expect(world.landmarks.has(beacon.name)).toBe(true);
  world.dispose();
});

