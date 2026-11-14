import * as THREE from 'three';
import { staticBatch } from './sceneUtils.js';

export const PORT_SPAWN = { x: -250, y: 0, z: -395, yaw: 0, grounded: true };

/** Reclaimed waterfront district west of the original city. All units are metres. */
export function buildPortCity({ group, building, collider }) {
  const batch = staticBatch(group);
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({color, roughness:0.72, ...extra});
  const sand = mat(0xd8c6a1), stone = mat(0xa8b7b5), paving = mat(0xc9d1ca);
  const road = mat(0x35454b), white = mat(0xe2e1d2), steel = mat(0x315568,{metalness:0.7});
  const wood = mat(0x947451), glass = mat(0x5d9fa8,{metalness:0.65,roughness:0.2});
  const light = mat(0xffe4ab,{emissive:0xffc777,emissiveIntensity:0});
  const red = mat(0xb64c3e), blue = mat(0x39677d), green = mat(0x6d8468);
  // Solid raised platform with a continuous seawall; no overlapping road planes.
  batch.box(sand,[-305,-2,-570],[290,3.6,420]);
  batch.box(paving,[-305,-0.12,-570],[282,0.12,412]);
  for(const x of [-450,-160]) batch.box(stone,[x,-0.6,-570],[3,3,420]);
  for(const z of [-780,-360]) batch.box(stone,[-305,-0.6,z],[290,3,3]);
  // Causeway meets the existing promenade, ending before the mainland street.
  batch.box(stone,[-145,-1.2,-385],[40,2,24]);
  batch.box(road,[-145,0,-385],[42,0.06,16]);
  batch.box(road,[-250,0,-568],[16,0.06,394]);
  batch.box(road,[-350,0,-568],[16,0.06,394]);
  for(const z of [-450,-690]) batch.box(road,[-300,0,z],[84,0.06,16]);
  for(const x of [-250,-350]) for(let z=-740;z<-410;z+=14) {
    if(Math.abs(z+450)<15 || Math.abs(z+690)<15) continue;
    batch.box(white,[x,0.06,z],[0.13,0.025,7]);
  }
  // Two stepped office towers and residential terraces frame the marina.
  for(const [x,z,h] of [[-302,-510,114],[-302,-606,151],[-205,-540,54],[-205,-625,70],[-400,-545,33],[-400,-625,43]]) {
    building(x,z,32,h,38,0);
    batch.box(glass,[x,h+3,z],[23,5,28]);
    collider(x,z,23,5,28,h);
    for(const y of [h*0.33,h*0.66]) batch.box(white,[x,y,z],[34,0.8,40]);
  }
  // Waterfront gardens, benches, lanterns and observation plaza.
  for(let z=-745;z<-370;z+=24) {
    batch.box(green,[-425,0,z],[12,0.1,16]);
    batch.box(wood,[-435,0.6,z],[2.8,0.18,0.8]);
    batch.box(steel,[-442,2.4,z],[0.18,4.8,0.18]);
    batch.box(light,[-442,4.8,z],[0.6,0.3,0.6]);
  }
  // Small marina fingers project west, into water rather than onto the ground.
  batch.box(wood,[-472,0.3,-420],[45,0.6,7]);
  for(const z of [-400,-440]) {
    batch.box(wood,[-486,0.3,z],[4,0.6,42]);
    for(const x of [-468,-505]) batch.box(wood,[x,0.3,z],[36,0.6,3]);
  }
  // Northern container terminal and breakwater.
  batch.box(stone,[-295,-1.6,-850],[310,3,126]);
  batch.box(road,[-295,0,-850],[298,0.08,114]);
  batch.box(stone,[-510,-0.5,-775],[12,3,340]);
  batch.box(stone,[-430,-0.5,-940],[172,3,12]);
  for(let row=0;row<3;row++) for(let col=0;col<6;col++) {
    const x=-405+col*40,z=-815-row*30,h=3+(col%3)*3;
    batch.box([red,blue,green][(row+col)%3],[x,h/2,z],[30,h,10]);
    collider(x,z,30,h,10);
    for(let k=-13;k<14;k+=2) batch.box(steel,[x+k,h/2,z+5.06],[0.12,h,0.12]);
  }
  const cranes=[];
  for(const z of [-825,-890]) {
    const root=new THREE.Group();root.position.set(-462,0,z);group.add(root);
    const local=staticBatch(root);
    for(const x of [-9,9]) for(const dz of [-8,8]) local.box(steel,[x,21,dz],[1.4,42,1.4]);
    local.box(steel,[-10,43,0],[76,2,4]);local.box(steel,[8,28,0],[3,30,4]);
    local.box(white,[4,40,4],[7,5,5]);
    local.finish();
    const cable=new THREE.Mesh(new THREE.BoxGeometry(0.1,25,0.1),steel);cable.position.set(-25,29,0);root.add(cable);
    const hook=new THREE.Mesh(new THREE.BoxGeometry(9,0.5,3),red);hook.position.set(-25,16.5,0);root.add(hook);
    cranes.push({cable,hook});collider(-462,z,23,45,20);
  }
  const boats=[];
  function boat(x,z,length,width,cargo=false) {
    const root=new THREE.Group();root.position.set(x,0,z);group.add(root);
    const local=staticBatch(root);
    local.box(cargo ? steel : white,[0,0,0],[width,2,length]);
    local.box(cargo ? red : wood,[0,1.05,0],[width*0.88,0.16,length*0.94]);
    local.box(white,[0,3,length*0.25],[width*0.7,4,length*0.2]);
    local.box(glass,[0,4.2,length*0.25],[width*0.72,1.1,length*0.21]);
    local.box(steel,[0,7,length*0.25],[0.25,6,0.25]);
    if(cargo) for(let i=0;i<5;i++) for(const side of [-1,1]) local.box(i%2 ? blue : red,[side*width*0.22,3,-length*0.35+i*length*0.1],[width*0.39,4,length*0.085]);
    local.box(light,[0,7,length*0.25],[0.5,0.5,0.5]);
    local.finish();boats.push({root,x,z,cargo});
  }
  boat(-485,-860,82,19,true);
  boat(-477,-400,13,4);boat(-499,-440,16,4.5);boat(-470,-440,11,3.5);
  // District sign doubles as a clear landmark when approaching from the south.
  const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#142f38';ctx.fillRect(0,0,1024,128);
  ctx.fillStyle='#c9e8d9';ctx.font='bold 66px sans-serif';ctx.textAlign='center';ctx.fillText('PORT CITY  /  MARINA',512,88);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(30,3.75),new THREE.MeshBasicMaterial({map:texture}));sign.position.set(-300,5,-365);group.add(sign);
  for(const x of [-313,-287]) batch.box(steel,[x,2,-365],[0.3,4,0.3]);
  // Spawn pad sits beside the road, clear of towers and the marina edge.
  const pad=new THREE.Mesh(new THREE.RingGeometry(5.5,6,64),new THREE.MeshBasicMaterial({color:0x9ee7cc}));
  pad.rotation.x=-Math.PI/2;pad.position.set(PORT_SPAWN.x,0.1,PORT_SPAWN.z);group.add(pad);
  batch.finish();
  return { update(time,solar) {
    light.emissiveIntensity=0.2+solar.night*3;
    boats.forEach(({root,x,z,cargo},i)=>{
      root.position.set(x,-0.25+Math.sin(time*0.8+i)*0.18,z);
      root.rotation.z=Math.sin(time*0.55+i)* (cargo ? 0.008 : 0.035);
      root.rotation.x=Math.cos(time*0.7+i)*0.018;
    });
    cranes.forEach(({cable,hook},i)=>{
      const lift=3+Math.sin(time*0.18+i)*3;
      cable.scale.y=(25-lift)/25;cable.position.y=29+lift/2;hook.position.y=16.5+lift;
    });
  } };
}
