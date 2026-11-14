import * as THREE from 'three';
import { seededRandom } from './sceneUtils.js';
import { glowTexture } from './cityTextures.js';

/** Rounded closed route with continuous tangents, entirely on the street grid. */
export function trafficRoute(inset = 0) {
  const left=65+inset, right=425-inset, top=-600+inset, bottom=360-inset, r=9;
  const points=[[left+r,top],[right-r,top],[right,top+r],[right,bottom-r],[right-r,bottom],[left+r,bottom],[left,bottom-r],[left,top+r]];
  const corners=[[right,top],[right,bottom],[left,bottom],[left,top]];
  const vector=p=>new THREE.Vector3(p[0],0,p[1]);
  const curve=new THREE.CurvePath();
  for(let i=0;i<4;i++) {
    curve.add(new THREE.LineCurve3(vector(points[i*2]),vector(points[i*2+1])));
    curve.add(new THREE.QuadraticBezierCurve3(vector(points[i*2+1]),vector(corners[i]),vector(points[(i*2+2)%8])));
  }
  curve.arcLengthDivisions=600; return curve;
}

export function buildCityLife() {
  const group=new THREE.Group(); group.name='Traffic and pedestrians';
  const random=seededRandom(204), carCount=40, peopleCount=72;
  const material=(color,options={})=>new THREE.MeshStandardMaterial({color,roughness:0.6,...options});
  const carPaint=material(0xffffff,{metalness:0.45,roughness:0.28});
  const carGlass=material(0x203d49,{metalness:0.55,roughness:0.18});
  const tires=material(0x15191b), chrome=material(0x949b9d,{metalness:0.8,roughness:0.28});
  const headlamp=material(0xffffe5,{emissive:0xffeaca,emissiveIntensity:0});
  const taillamp=material(0xa72d20,{emissive:0xff2108,emissiveIntensity:0});
  const box=new THREE.BoxGeometry(1,1,1), sphere=new THREE.SphereGeometry(1,10,8), capsule=new THREE.CapsuleGeometry(0.12,0.5,3,8);
  const wheelGeo=new THREE.CylinderGeometry(0.32,0.32,0.22,12); wheelGeo.rotateZ(Math.PI/2);
  function instances(geometry,mat,count) {
    const mesh=new THREE.InstancedMesh(geometry,mat,count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false; group.add(mesh); return mesh;
  }
  const bodies=instances(box,carPaint,carCount), cabins=instances(box,carGlass,carCount), roofs=instances(box,carPaint,carCount), wheels=instances(wheelGeo,tires,carCount*4), hubs=instances(wheelGeo,chrome,carCount*4);
  const fronts=instances(box,headlamp,carCount*2), backs=instances(box,taillamp,carCount*2);
  const beamMat=new THREE.MeshBasicMaterial({map:glowTexture(),color:0xffe0a7,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const beamGeo=new THREE.PlaneGeometry(1,1); beamGeo.rotateX(-Math.PI/2);
  const beams=instances(beamGeo,beamMat,carCount); beams.castShadow=false;
  const routes=[trafficRoute(-3),trafficRoute(3)], lengths=routes.map(r=>r.getLength());
  const palette=[0xe0e4e0,0xa7b5ba,0x293b47,0xa04b3b,0xceb77a,0x637e83,0xf0eee3];
  const cars=Array.from({length:carCount},(_,i)=>({route:i%2,progress:Math.floor(i/2)/(carCount/2),bus:i%13===0,color:new THREE.Color(palette[i%palette.length])}));
  const traffic = cars.map((car,index) => ({id:index,x:0,y:0,z:0,yaw:0,halfWidth:0.95,halfLength:car.bus ? 3.4 : 2.1,height:1.7,active:false,destroyed:false,previous:null}));
  cars.forEach((car,i)=>{ bodies.setColorAt(i,car.color); roofs.setColorAt(i,car.color); });

  const shirts=instances(capsule,material(0xffffff),peopleCount), heads=instances(sphere,material(0xffffff),peopleCount);
  const legs=instances(capsule,material(0x2e3944),peopleCount*2), arms=instances(capsule,material(0xffffff),peopleCount*2);
  const skin=[0x9e7154,0xbe8d69,0x80563e,0xd3a980], clothing=[0xbd7259,0xe0d4b2,0x4d758d,0x6c8070,0xe4e3dd,0x8b7493];
  const people=Array.from({length:peopleCount},(_,i)=>({
    x:i%3===0 ? 45+random()*3 : -126+random()*8,
    z:-390+random()*780, direction:i%2 ? 1 : -1, speed:0.75+random()*0.65, phase:random()*Math.PI*2, scale:0.9+random()*0.17,
  }));
  people.forEach((p,i)=>{
    shirts.setColorAt(i,new THREE.Color(clothing[i%clothing.length])); heads.setColorAt(i,new THREE.Color(skin[i%skin.length]));
    for(let side=0;side<2;side++) arms.setColorAt(i*2+side,new THREE.Color(clothing[i%clothing.length]));
  });
  const root=new THREE.Object3D(), part=new THREE.Object3D(), matrix=new THREE.Matrix4(), position=new THREE.Vector3(), tangent=new THREE.Vector3();
  function place(mesh,index,pos,scale=[1,1,1],angle=0) {
    part.position.set(...pos); part.scale.set(...scale); part.rotation.set(angle,0,0); part.updateMatrix();
    matrix.multiplyMatrices(root.matrix,part.matrix); mesh.setMatrixAt(index,matrix);
  }
  let travelled=[0,0];
  function update(elapsed,delta,solar,options) {
    group.visible=options.cityLife;
    people.forEach(p=>{p.active=false;});
    traffic.forEach(car => { car.active=false; });
    if(!group.visible) return;
    const visibleCars=options.quality==='low' ? 20 : carCount, visiblePeople=options.quality==='low' ? 28 : peopleCount;
    bodies.count=cabins.count=roofs.count=beams.count=visibleCars; fronts.count=backs.count=visibleCars*2; wheels.count=hubs.count=visibleCars*4;
    shirts.count=heads.count=visiblePeople; legs.count=arms.count=visiblePeople*2;
    headlamp.emissiveIntensity=0.25+solar.night*4; taillamp.emissiveIntensity=0.4+solar.night*2; beamMat.opacity=solar.night*0.2;
    travelled=travelled.map((distance,i)=>(distance+delta*9/lengths[i])%1);
    for(let i=0;i<visibleCars;i++) {
      const car=cars[i], direction=car.route===0 ? 1 : -1, t=((car.progress+travelled[car.route]*direction)%1+1)%1;
      routes[car.route].getPointAt(t,position); routes[car.route].getTangentAt(t,tangent);
      const vehicle=traffic[i];
      vehicle.previous=vehicle.initialized ? {x:vehicle.x,z:vehicle.z} : {x:position.x,z:position.z};
      if(!vehicle.destroyed) {vehicle.x=position.x;vehicle.z=position.z;vehicle.yaw=Math.atan2(tangent.x*direction,tangent.z*direction);}
      vehicle.active=true; vehicle.initialized=true;
      root.position.set(vehicle.x,0,vehicle.z); root.rotation.set(0,vehicle.yaw,vehicle.destroyed ? 0.1 : 0); root.scale.set(1,1,car.bus ? 1.65 : 1); root.updateMatrix();
      place(bodies,i,[0,0.66,0],[1.85,0.66,4.1]); place(cabins,i,[0,1.23,-0.2],[1.6,0.63,2.25]); place(roofs,i,[0,1.57,-0.2],[1.65,0.12,1.95]);
      for(let j=0;j<4;j++) {
        const x=j%2 ? 0.91 : -0.91,z=j<2 ? -1.28 : 1.28;
        place(wheels,i*4+j,[x,0.35,z]); place(hubs,i*4+j,[x*1.12,0.35,z],[1.05,0.6,0.6]);
      }
      for(let side=0;side<2;side++) {
        place(fronts,i*2+side,[side ? 0.63 : -0.63,0.8,2.06],vehicle.destroyed ? [0,0,0] : [0.44,0.2,0.06]);
        place(backs,i*2+side,[side ? 0.65 : -0.65,0.82,-2.06],vehicle.destroyed ? [0,0,0] : [0.36,0.17,0.06]);
      }
      place(beams,i,[0,0.065,5],vehicle.destroyed ? [0,0,0] : [5,1,8]);
    }
    for(let i=0;i<visiblePeople;i++) {
      const p=people[i]; p.active=true;
      if(!p.impact) {p.z+=p.direction*p.speed*delta; if(p.z>415) p.z=-415; if(p.z<-415) p.z=415;}
      else {p.impact.age+=delta;p.x+=p.impact.vx*delta*Math.exp(-p.impact.age*3);p.z+=p.impact.vz*delta*Math.exp(-p.impact.age*3);}
      const stride=Math.sin(elapsed*p.speed*5+p.phase)*0.45;
      root.position.set(p.x,0.04,p.z); root.rotation.set(0,p.direction>0 ? 0 : Math.PI,0); root.scale.setScalar(p.scale); root.updateMatrix();
      if(p.impact) {root.position.y=0.2;root.rotation.z=Math.min(1,p.impact.age*3)*Math.PI/2;root.updateMatrix();}
      place(shirts,i,[0,1.1,0],[1.65,0.8,1]); place(heads,i,[0,1.64,0],[0.16,0.2,0.16]);
      for(let side=0;side<2;side++) {
        const sign=side ? 1 : -1;
        place(legs,i*2+side,[sign*0.11,0.46,sign*stride*0.24],[0.78,1.05,0.78],sign*stride);
        place(arms,i*2+side,[sign*0.27,1.08,-sign*stride*0.2],[0.65,0.82,0.65],-sign*stride);
      }
    }
    group.children.forEach(mesh=>{ if(mesh.isInstancedMesh) mesh.instanceMatrix.needsUpdate=true; });
  }
  function blast(center,radius) {
    const hit=[];
    traffic.forEach((car,i)=>{
      if(!car.active || car.destroyed || Math.hypot(car.x-center.x,1-(center.y??1),car.z-center.z)>radius) return;
      car.destroyed=true;hit.push({x:car.x,y:1,z:car.z});
      bodies.setColorAt(i,new THREE.Color(0x252624));roofs.setColorAt(i,new THREE.Color(0x242322));
    });
    if(hit.length) {bodies.instanceColor.needsUpdate=true;roofs.instanceColor.needsUpdate=true;}
    people.forEach(p=>{
      if(!p.active || p.impact || Math.hypot(p.x-center.x,1-(center.y??1),p.z-center.z)>radius) return;
      const distance=Math.max(1,Math.hypot(p.x-center.x,p.z-center.z));
      p.impact={age:0,vx:(p.x-center.x)/distance*6,vz:(p.z-center.z)/distance*6,originalX:p.x,originalZ:p.z};
    });
    return hit;
  }
  function resetTraffic() {
    travelled=[0,0];
    people.forEach(p=>{if(p.impact){p.x=p.impact.originalX;p.z=p.impact.originalZ;}p.impact=null;});
    traffic.forEach((car,i)=>{car.destroyed=false;car.initialized=false;bodies.setColorAt(i,cars[i].color);roofs.setColorAt(i,cars[i].color);});
    bodies.instanceColor.needsUpdate=true;roofs.instanceColor.needsUpdate=true;
  }
  return {group,update,traffic,people,blast,resetTraffic};
}
