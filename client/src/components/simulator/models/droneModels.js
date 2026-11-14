import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { disposeObject } from '../world/sceneUtils.js';

function add(group,geometry,material,position=[0,0,0],rotation=[0,0,0]) {
  const mesh=new THREE.Mesh(geometry,material); mesh.position.set(...position); mesh.rotation.set(...rotation); mesh.castShadow=true; mesh.receiveShadow=true; group.add(mesh); return mesh;
}
function rounded(group,material,size,position,radius=0.04) {
  return add(group,new RoundedBoxGeometry(...size,3,radius),material,position);
}
function beam(group,material,start,end,radius=0.035) {
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),delta=b.clone().sub(a);
  const mesh=add(group,new THREE.CylinderGeometry(radius,radius,delta.length(),12),material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()); return mesh;
}
function materials(accent) {
  const pixels=new Uint8Array(8*8*4);
  for(let i=0;i<64;i++) { const v=((i%8<4)===(Math.floor(i/8)<4)) ? 66 : 31; pixels.set([v,v+3,v+5,255],i*4); }
  const weave=new THREE.DataTexture(pixels,8,8); weave.wrapS=weave.wrapT=THREE.RepeatWrapping; weave.repeat.set(12,12); weave.colorSpace=THREE.SRGBColorSpace; weave.needsUpdate=true;
  return {
    shell:new THREE.MeshPhysicalMaterial({color:0xd0d6d5,roughness:0.33,metalness:0.2,clearcoat:0.5}),
    carbon:new THREE.MeshStandardMaterial({color:0x939b9b,map:weave,metalness:0.35,roughness:0.58}),
    rubber:new THREE.MeshStandardMaterial({color:0x141b20,roughness:0.85}),
    metal:new THREE.MeshStandardMaterial({color:0x767e86,metalness:0.85,roughness:0.24}),
    accent:new THREE.MeshStandardMaterial({color:accent,metalness:0.45,roughness:0.32}),
    glass:new THREE.MeshPhysicalMaterial({color:0x122838,metalness:0.65,roughness:0.09,clearcoat:1}),
    red:new THREE.MeshStandardMaterial({color:0xff372a,emissive:0xff1908,emissiveIntensity:2.5}),
    green:new THREE.MeshStandardMaterial({color:0x50e4bd,emissive:0x14e795,emissiveIntensity:2.5}),
    blade:new THREE.MeshStandardMaterial({color:0x252d33,metalness:0.2,roughness:0.48}),
  };
}
function rotor(group,p,m,rotorMeshes,radius=0.39,index=0) {
  add(group,new THREE.CylinderGeometry(0.084,0.09,0.14,24),m.metal,[p[0],p[1]-0.07,p[2]]);
  add(group,new THREE.CylinderGeometry(0.088,0.088,0.045,24),m.rubber,[p[0],p[1]-0.025,p[2]]);
  const spinning=new THREE.Group(); spinning.position.set(...p); group.add(spinning);
  const shape=new THREE.Shape(); shape.moveTo(0,0.025); shape.bezierCurveTo(radius*0.4,0.12,radius*0.95,0.08,radius,0.015); shape.quadraticCurveTo(radius*0.6,-0.015,0,-0.025);
  const bladeGeo=new THREE.ExtrudeGeometry(shape,{depth:0.012,bevelEnabled:false,curveSegments:10}); bladeGeo.rotateX(Math.PI/2);
  for(let side=0;side<2;side++) add(spinning,bladeGeo,m.blade,[0,0,0],[0,side*Math.PI,0]);
  add(spinning,new THREE.SphereGeometry(0.045,16,8),m.metal,[0,0.012,0]).scale.set(1,0.5,1);
  const blur=new THREE.Mesh(new THREE.RingGeometry(0.075,radius,48),new THREE.MeshBasicMaterial({color:0xa7b7bc,side:THREE.DoubleSide,transparent:true,opacity:0,depthWrite:false}));
  blur.rotation.x=-Math.PI/2; blur.position.y=0.009; spinning.add(blur); spinning.userData.blur=blur; spinning.userData.direction=index%2 ? -1 : 1;
  rotorMeshes.push(spinning);
}
function lens(group,m,position,size=1) {
  const assembly=new THREE.Group(); assembly.position.set(...position); assembly.scale.setScalar(size); group.add(assembly);
  rounded(assembly,m.rubber,[0.23,0.19,0.2],[0,0,0],0.045);
  add(assembly,new THREE.CylinderGeometry(0.075,0.075,0.045,32),m.metal,[0,0,-0.12],[Math.PI/2,0,0]);
  add(assembly,new THREE.CylinderGeometry(0.062,0.062,0.012,32),m.glass,[0,0,-0.147],[Math.PI/2,0,0]);
  add(assembly,new THREE.TorusGeometry(0.064,0.005,6,32),m.accent,[0,0,-0.154]);
}
function finish(group,rotorMeshes,m) {
  // Unused palette entries are also released when this model is swapped.
  const used=new Set(); group.traverse(object=>{ if(object.material) used.add(object.material); });
  Object.values(m).forEach(material=>{ if(!used.has(material)) { material.map?.dispose(); material.dispose(); } });
  const bounds=new THREE.Box3().setFromObject(group);
  return {group,rotorMeshes,groundClearance:-bounds.min.y+0.08,dispose:()=>disposeObject(group)};
}
function buildCompactQuad() {
  const group=new THREE.Group(),rotorMeshes=[],m=materials(0x57aca9);
  rounded(group,m.rubber,[0.51,0.14,0.77],[0,-0.04,0],0.08);
  rounded(group,m.shell,[0.56,0.2,0.85],[0,0.07,0],0.1);
  rounded(group,m.shell,[0.38,0.07,0.57],[0,0.2,0.08],0.03);
  rounded(group,m.accent,[0.16,0.008,0.25],[0,0.24,0.1],0.003);
  for(const x of [-0.15,0.15]) {
    add(group,new THREE.CylinderGeometry(0.046,0.046,0.012,20),m.glass,[x,0.1,-0.431],[Math.PI/2,0,0]);
    for(let i=0;i<6;i++) rounded(group,m.rubber,[0.008,0.04,0.18],[x*1.75,0.06,0.09+i*0.035],0.002);
  }
  beam(group,m.metal,[-0.1,-0.09,-0.3],[-0.1,-0.22,-0.3],0.019);
  beam(group,m.metal,[0.1,-0.09,-0.3],[0.1,-0.22,-0.3],0.019);
  lens(group,m,[0,-0.24,-0.37]);
  [[-0.72,-0.68],[0.72,-0.68],[-0.66,0.64],[0.66,0.64]].forEach(([x,z],i)=>{
    beam(group,m.shell,[Math.sign(x)*0.22,0,Math.sign(z)*0.23],[x,0.01,z],0.052);
    add(group,new THREE.CylinderGeometry(0.075,0.075,0.09,20),m.metal,[Math.sign(x)*0.25,0.02,Math.sign(z)*0.25]);
    rotor(group,[x,0.17,z],m,rotorMeshes,0.38,i);
    rounded(group,x<0 ? m.red : m.green,[0.07,0.028,0.05],[x,-0.02,z-0.07],0.01);
    beam(group,m.rubber,[x,-0.03,z],[x,-0.33,z+0.04],0.023);
    rounded(group,m.rubber,[0.09,0.03,0.17],[x,-0.34,z+0.04],0.015);
  });
  return finish(group,rotorMeshes,m);
}
function buildRacingQuad() {
  const group=new THREE.Group(),rotorMeshes=[],m=materials(0xe17a45);
  rounded(group,m.carbon,[0.33,0.04,0.61],[0,0,0],0.02);
  rounded(group,m.carbon,[0.29,0.035,0.46],[0,0.17,0.05],0.02);
  for(const x of [-0.12,0.12]) for(const z of [-0.15,0.2]) beam(group,m.accent,[x,0,z],[x,0.16,z],0.016);
  rounded(group,m.rubber,[0.22,0.16,0.36],[0,0.27,0.09],0.025);
  for(const z of [-0.02,0.19]) rounded(group,m.accent,[0.23,0.175,0.035],[0,0.27,z],0.008);
  rounded(group,m.accent,[0.2,0.035,0.2],[0,0.08,0],0.005);
  lens(group,m,[0,0.12,-0.3],0.8);
  beam(group,m.rubber,[0,0.17,0.25],[0,0.5,0.43],0.012);
  add(group,new THREE.SphereGeometry(0.048,12,8),m.accent,[0,0.5,0.43]);
  [[-0.56,-0.48],[0.56,-0.48],[-0.56,0.48],[0.56,0.48]].forEach(([x,z],i)=>{
    beam(group,m.carbon,[Math.sign(x)*0.1,0,Math.sign(z)*0.14],[x,0,z],0.045);
    beam(group,m.accent,[Math.sign(x)*0.11,0.025,Math.sign(z)*0.15],[x,0.025,z],0.009);
    rotor(group,[x,0.13,z],m,rotorMeshes,0.29,i);
    rounded(group,m.rubber,[0.1,0.08,0.12],[x,-0.07,z],0.02);
  });
  return finish(group,rotorMeshes,m);
}
function buildHexacopter() {
  const group=new THREE.Group(),rotorMeshes=[],m=materials(0xc6a35e);
  add(group,new THREE.CylinderGeometry(0.45,0.48,0.16,12),m.carbon);
  add(group,new THREE.CylinderGeometry(0.43,0.45,0.07,12),m.metal,[0,0.11,0]);
  rounded(group,m.shell,[0.43,0.19,0.49],[0,0.22,0],0.06);
  rounded(group,m.accent,[0.17,0.01,0.31],[0,0.321,0],0.005);
  beam(group,m.metal,[0.18,0.3,0.1],[0.18,0.52,0.1],0.012);
  add(group,new THREE.CylinderGeometry(0.09,0.09,0.035,24),m.shell,[0.18,0.53,0.1]);
  for(let i=0;i<6;i++) {
    const angle=(i/6)*Math.PI*2+Math.PI/6,x=Math.sin(angle)*1.03,z=Math.cos(angle)*1.03;
    beam(group,m.carbon,[x*0.32,0,z*0.32],[x,0,z],0.045);
    beam(group,m.metal,[x*0.35,-0.035,z*0.35],[x,-0.035,z],0.012);
    rotor(group,[x,0.16,z],m,rotorMeshes,0.39,i);
    rounded(group,x<0 ? m.red : m.green,[0.06,0.03,0.06],[x,-0.06,z],0.01);
  }
  for(const x of [-0.43,0.43]) {
    for(const z of [-0.28,0.28]) beam(group,m.carbon,[x*0.7,-0.06,z],[x,-0.62,z*1.5],0.023);
    beam(group,m.rubber,[x,-0.63,-0.59],[x,-0.63,0.59],0.035);
  }
  beam(group,m.metal,[0,-0.1,0],[0,-0.3,0],0.04); lens(group,m,[0,-0.38,-0.04],1.2);
  return finish(group,rotorMeshes,m);
}

/** Frame-rate independent motors and transparent rotor sweep, stopped on landing. */
export function animateDroneRotors(rotors,delta,powered) {
  rotors.forEach(rotor=>{
    rotor.rotation.y+=rotor.userData.direction*delta*(powered ? 95 : 0);
    if(rotor.userData.blur) rotor.userData.blur.material.opacity=powered ? 0.13 : 0;
  });
}

export const DRONE_MODELS = [
  {
    id:          'compact-quad',
    name:        'Nexus Compact',
    tagline:     'Photography & Mapping',
    description: 'Foldable design with integrated camera gimbal. Quiet motors, stable flight characteristics, ideal for aerial surveys.',
    specs:       { motors: 4, maxAlt: '500m', endurance: '28 min', payload: '250g' },
    accentColor: '#0ea5e9',
    build:       buildCompactQuad,
  },
  {
    id:          'racing-quad',
    name:        'Viper X4',
    tagline:     'FPV Racing',
    description: 'Ultra-lightweight carbon frame, monster thrust-to-weight ratio. Built for speed and agility with a forward FPV camera.',
    specs:       { motors: 4, maxAlt: '200m', endurance: '8 min', payload: '0g' },
    accentColor: '#ff4500',
    build:       buildRacingQuad,
  },
  {
    id:          'hexacopter',
    name:        'Atlas H6',
    tagline:     'Heavy-Lift Platform',
    description: 'Six-motor redundant platform for payload delivery and inspection. Motor-failure tolerant with a secure payload bay.',
    specs:       { motors: 6, maxAlt: '400m', endurance: '22 min', payload: '2kg' },
    accentColor: '#10b981',
    build:       buildHexacopter,
  },
];

/** Get a model definition by id (falls back to first model). */
export function getModelById(id) {
  return DRONE_MODELS.find((m) => m.id === id) ?? DRONE_MODELS[0];
}
