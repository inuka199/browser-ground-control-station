import * as THREE from 'three';
import { disposeObject } from './sceneUtils.js';
import { DELIVERY_A, DELIVERY_B, RECIPIENT_HOME } from '../challengeGame.js';

function box(parent,size,position,color) {
  const mesh=new THREE.Mesh(new THREE.BoxGeometry(...size),new THREE.MeshStandardMaterial({color,roughness:0.65}));
  mesh.position.set(...position);mesh.castShadow=true;parent.add(mesh);return mesh;
}
function marker(parent,point,text,color) {
  const root=new THREE.Group();root.position.set(point.x,0.12,point.z);parent.add(root);
  const ring=new THREE.Mesh(new THREE.TorusGeometry(5.5,0.16,6,64),new THREE.MeshBasicMaterial({color}));ring.rotation.x=Math.PI/2;root.add(ring);
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#10252ddd';ctx.fillRect(0,0,512,128);ctx.fillStyle=color;ctx.textAlign='center';ctx.font='bold 52px sans-serif';ctx.fillText(text,256,84);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,depthTest:false}));label.scale.set(16,4,1);label.position.y=8;root.add(label);
  return root;
}
export function createChallengeActors(scene,id) {
  const group=new THREE.Group();scene.add(group);
  const car=new THREE.Group();group.add(car);
  const body=box(car,[1.9,0.65,4.2],[0,0.68,0],0xf26132);
  const cabin=box(car,[1.65,0.65,2.2],[0,1.25,-0.2],0x172e3c);
  box(car,[1.67,0.1,2],[0,1.61,-0.2],0xe6a749);
  for(const x of [-1,1]) for(const z of [-1.35,1.35]) {
    const wheel=new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,0.22,12),new THREE.MeshStandardMaterial({color:0x171d24}));wheel.rotation.z=Math.PI/2;wheel.position.set(x,0.35,z);car.add(wheel);
  }
  for(const x of [-0.6,0.6]) box(car,[0.4,0.15,0.08],[x,0.8,2.15],0xffe2a9);
  const targetMarker=marker(group,{x:0,z:0},'TARGET','#ffad64');
  const pickup=marker(group,DELIVERY_A,'A · PICKUP','#f6c882');
  const dropoff=marker(group,DELIVERY_B,'B · DELIVERY','#85edbd');
  const parcel=new THREE.Group();box(parcel,[0.55,0.4,0.45],[0,0,0],0xbb884f);box(parcel,[0.08,0.41,0.46],[0,0,0],0xe7cb90);group.add(parcel);
  const person=new THREE.Group();group.add(person);
  box(person,[0.46,0.65,0.26],[0,1.15,0],0x5899b9);
  const head=new THREE.Mesh(new THREE.SphereGeometry(0.18,12,8),new THREE.MeshStandardMaterial({color:0xc48c66}));head.position.y=1.7;person.add(head);
  const arms=[-1,1].map(sign=>box(person,[0.14,0.6,0.15],[sign*0.32,1.15,0],0x5899b9));
  const legs=[-1,1].map(sign=>box(person,[0.17,0.72,0.2],[sign*0.13,0.4,0],0x28394e));
  arms.forEach(arm=>{const hand=new THREE.Mesh(new THREE.SphereGeometry(0.08,8,6),new THREE.MeshStandardMaterial({color:0xc48c66}));hand.position.y=-0.36;arm.add(hand);});
  legs.forEach(leg=>box(leg,[0.2,0.1,0.32],[0,-0.35,0.06],0x18222a));
  const hair=new THREE.Mesh(new THREE.SphereGeometry(0.185,12,8,0,Math.PI*2,0,Math.PI/2),new THREE.MeshStandardMaterial({color:0x2f2925}));hair.position.y=1.74;person.add(hair);
  let hitAt=null;
  return {
    blast(center,radius) { if(id==='parcel-delivery' && person.position.distanceTo(new THREE.Vector3(center.x,center.y,center.z))<=radius) hitAt={age:0}; },
    update(state,aircraft,elapsed) {
      const pursuit=id==='pursuit';car.visible=targetMarker.visible=pursuit;pickup.visible=dropoff.visible=person.visible=!pursuit;parcel.visible=!pursuit;
      if(pursuit) {
        car.position.set(state.target.x,0,state.target.z);car.rotation.set(0,state.target.yaw,state.detonated ? 0.12 : 0);
        targetMarker.position.set(state.target.x,0.2,state.target.z);targetMarker.visible=!state.detonated;
        if(state.detonated) {body.material.color.setHex(0x262b30);cabin.material.color.setHex(0x141619);}
      } else {
        pickup.visible=state.stage===0;
        person.position.set(state.recipient.x,0,state.recipient.z);person.rotation.y=state.recipient.yaw||0;
        const moving=state.stage===2 && (state.phase==='depart' || Math.hypot(state.recipient.x-aircraft.position.x-1.5,state.recipient.z-aircraft.position.z)>0.3);
        const stride=moving ? Math.sin(elapsed*9)*0.5 : 0;
        legs[0].rotation.x=stride;legs[1].rotation.x=-stride;
        const collecting=state.phase==='depart' || state.collection>0;
        arms[0].rotation.x=collecting ? -1.2 : -stride;
        arms[1].rotation.x=collecting ? -1.2 : stride;
        if(state.carrying) {parcel.position.copy(aircraft.position);parcel.position.y=Math.max(0.3,parcel.position.y-0.25);}
        else if(state.phase==='depart') {parcel.position.copy(person.position).add(new THREE.Vector3(Math.sin(person.rotation.y)*0.4,1.05,Math.cos(person.rotation.y)*0.4));}
        else parcel.position.set(DELIVERY_A.x,0.3,DELIVERY_A.z);
        dropoff.children[0].material.color.set(state.status==='complete' ? '#ffffff' : '#85edbd');
        if(state.status==='complete') {person.position.set(RECIPIENT_HOME.x,0,RECIPIENT_HOME.z);legs.forEach(leg=>{leg.rotation.x=0;});}
        if(hitAt) {hitAt.age=hitAt.start===undefined ? 0 : elapsed-hitAt.start;hitAt.start??=elapsed;person.position.y=0.2;person.rotation.z=Math.min(1,hitAt.age*3)*Math.PI/2;parcel.visible=false;}
      }
    },
    dispose() {scene.remove(group);disposeObject(group);},
  };
}
