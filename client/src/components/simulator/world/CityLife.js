import * as THREE from 'three';
import { seededRandom } from './sceneUtils.js';
import { glowTexture } from './cityTextures.js';
import { buildRoadFleet, roadVehicleAt } from './roadVehicles.js';

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
  const wheelGeo=new THREE.CylinderGeometry(0.5,0.5,1,12); wheelGeo.rotateZ(Math.PI/2);
  function instances(geometry,mat,count) {
    const mesh=new THREE.InstancedMesh(geometry,mat,count); mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.castShadow=true; mesh.receiveShadow=true; mesh.frustumCulled=false; group.add(mesh); return mesh;
  }
  const beamMat=new THREE.MeshBasicMaterial({map:glowTexture(),color:0xffe0a7,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const beamGeo=new THREE.PlaneGeometry(1,1); beamGeo.rotateX(-Math.PI/2);
  const routes=[trafficRoute(-3),trafficRoute(3)], lengths=routes.map(r=>r.getLength());
  const palette=[0xe0e4e0,0xa7b5ba,0x293b47,0xa04b3b,0xceb77a,0x637e83,0xf0eee3];
  const cars=Array.from({length:carCount},(_,i)=>({route:i%2,progress:Math.floor(i/2)/(carCount/2),model:roadVehicleAt(i),color:new THREE.Color(palette[i%palette.length])}));
  const traffic = cars.map(({model},id) => ({id,kind:model.kind,x:0,y:0,z:0,yaw:0,halfWidth:model.halfWidth,halfLength:model.halfLength,height:model.height,active:false,destroyed:false,previous:null}));
  const fleet=buildRoadFleet(cars,instances,{box,tyre:wheelGeo,hub:wheelGeo,beam:beamGeo},{
    paint:carPaint,glass:carGlass,trim:tires,tyre:tires,hub:chrome,headlamp,taillamp,
    brake:new THREE.MeshBasicMaterial({color:0xff4536}),beam:beamMat,
  });

  const shirts=instances(capsule,material(0xffffff),peopleCount), heads=instances(sphere,material(0xffffff),peopleCount);
  const legs=instances(capsule,material(0x2e3944),peopleCount*2), arms=instances(capsule,material(0xffffff),peopleCount*2);
  const hair=instances(sphere,material(0x372b26),peopleCount), shoes=instances(box,tires,peopleCount*2);
  const bags=instances(box,material(0xb18254),peopleCount);
  const stains=instances(sphere,material(0x973c3c),peopleCount);
  stains.name='Clothing stains'; stains.castShadow=false;
  const skin=[0x9e7154,0xbe8d69,0x80563e,0xd3a980], clothing=[0xbd7259,0xe0d4b2,0x4d758d,0x6c8070,0xe4e3dd,0x8b7493];
  const people=Array.from({length:peopleCount},(_,i)=>({
    id:i, style:['commuter','jogger','stroller'][i%3],
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
  function update(elapsed,delta,solar,options) {
    group.visible=options.cityLife;
    people.forEach(p=>{
      p.active=false;
      if(p.impact)p.impact.age+=delta;
    });
    if(!group.visible) {
      traffic.forEach(car => { car.active=false; });
      return;
    }
    const visibleCars=options.quality==='low' ? 20 : carCount, visiblePeople=options.quality==='low' ? 28 : peopleCount;
    fleet.setCount(visibleCars);
    for(let i=visibleCars;i<carCount;i++) traffic[i].active=false;
    shirts.count=heads.count=visiblePeople; legs.count=arms.count=visiblePeople*2;
    hair.count=visiblePeople;shoes.count=visiblePeople*2;bags.count=0;stains.count=0;
    headlamp.emissiveIntensity=0.25+solar.night*4; taillamp.emissiveIntensity=0.4+solar.night*2; beamMat.opacity=solar.night*0.2;
    for(let i=0;i<visibleCars;i++) {
      const car=cars[i], direction=car.route===0 ? 1 : -1, vehicle=traffic[i];
      const inset=car.route===0?-3:3;
      if(car.t===undefined)car.t=car.progress;
      routes[car.route].getPointAt(car.t,position);
      const cornerDistance=Math.hypot(Math.min(Math.abs(position.x-65-inset),Math.abs(position.x-425+inset)),
        Math.min(Math.abs(position.z+600-inset),Math.abs(position.z-360+inset)));
      const speed=vehicle.destroyed?0:4+7*THREE.MathUtils.smoothstep(cornerDistance,12,65);
      if(delta>0)vehicle.acceleration=Number.isFinite(vehicle.speed)?(speed-vehicle.speed)/delta:0;
      vehicle.speed=speed;
      const t=car.t=THREE.MathUtils.euclideanModulo(car.t+speed*delta*direction/lengths[car.route],1);
      routes[car.route].getPointAt(t,position); routes[car.route].getTangentAt(t,tangent);
      const previous=vehicle.active ? {x:vehicle.x,z:vehicle.z} : null;
      if(!vehicle.destroyed) {vehicle.x=position.x;vehicle.z=position.z;vehicle.yaw=Math.atan2(tangent.x*direction,tangent.z*direction);}
      vehicle.previous=previous ?? {x:vehicle.x,z:vehicle.z};
      vehicle.active=true;
      root.position.set(vehicle.x,0,vehicle.z); root.rotation.set(0,vehicle.yaw,vehicle.destroyed ? 0.1 : 0); root.scale.setScalar(1); root.updateMatrix();
      fleet.place(i,root.matrix,!vehicle.destroyed,vehicle.acceleration < -0.3);
    }
    for(let i=0;i<visiblePeople;i++) {
      const p=people[i]; p.active=true;
      const resting=p.style==='stroller' && (elapsed+p.phase*3)%18<4;
      p.walking=!resting && !p.impact;
      const pace=p.style==='jogger'?1.65:1;
      if(!p.impact) {p.z+=p.direction*p.speed*pace*(resting?0:1)*delta; if(p.z>415) p.z=-415; if(p.z<-415) p.z=415;}
      else {p.x+=p.impact.vx*delta*Math.exp(-p.impact.age*3);p.z+=p.impact.vz*delta*Math.exp(-p.impact.age*3);}
      const stride=resting||p.impact?0:Math.sin(elapsed*p.speed*pace*5+p.phase)*0.45;
      root.position.set(p.x,0.04,p.z); root.rotation.set(0,p.direction>0 ? 0 : Math.PI,0); root.scale.setScalar(p.scale); root.updateMatrix();
      if(p.impact) {root.position.y=0.2;root.rotation.z=Math.min(1,p.impact.age*3)*Math.PI/2;root.updateMatrix();}
      place(shirts,i,[0,1.1,0],[1.65,0.8,1]); place(heads,i,[0,1.64,0],[0.16,0.2,0.16]);
      place(hair,i,[0,1.75,-0.015],[0.167,p.style==='jogger'?0.08:0.12,0.17]);
      if(p.style==='commuter')place(bags,bags.count++,[0,1.17,-0.15],[0.31,0.36,0.16]);
      if(p.impact && p.impact.age<3) {
        const size=0.08*Math.min(1,0.3+p.impact.age*5,(3-p.impact.age)*2);
        place(stains,stains.count++,[0.05,1.14,0.106],[size,size*1.3,0.026]);
      }
      for(let side=0;side<2;side++) {
        const sign=side ? 1 : -1;
        place(legs,i*2+side,[sign*0.11,0.46,sign*stride*0.24],[0.78,1.05,0.78],sign*stride);
        place(shoes,i*2+side,[sign*0.11,0.13,sign*stride*0.43+0.055],[0.15,0.12,0.26]);
        const gesture=resting&&side===1?0.7+0.22*Math.sin(elapsed*3+p.phase):0;
        place(arms,i*2+side,[sign*0.27,1.08+gesture*0.12,-sign*stride*0.2+gesture*0.12],[0.65,0.82,0.65],-sign*stride-gesture);
      }
    }
    group.children.forEach(mesh=>{ if(mesh.isInstancedMesh) mesh.instanceMatrix.needsUpdate=true; });
  }
  function blast(center,radius) {
    const hit=[];
    traffic.forEach((car,i)=>{
      if(!car.active || car.destroyed || Math.hypot(car.x-center.x,1-(center.y??1),car.z-center.z)>radius) return;
      car.destroyed=true;hit.push({x:car.x,y:1,z:car.z});
      fleet.setPaint(i,new THREE.Color(0x252624));
    });
    people.forEach(p=>{
      if(!p.active || p.impact || Math.hypot(p.x-center.x,1-(center.y??1),p.z-center.z)>radius) return;
      const distance=Math.max(1,Math.hypot(p.x-center.x,p.z-center.z));
      p.impact={age:0,vx:(p.x-center.x)/distance*6,vz:(p.z-center.z)/distance*6,originalX:p.x,originalZ:p.z};
    });
    return hit;
  }
  function resetTraffic() {
    cars.forEach(car=>{car.t=car.progress;});
    people.forEach(p=>{if(p.impact){p.x=p.impact.originalX;p.z=p.impact.originalZ;}p.impact=null;});
    stains.count=0;
    traffic.forEach((car,i)=>{car.destroyed=false;car.active=false;car.speed=undefined;car.acceleration=0;fleet.setPaint(i,cars[i].color);});
  }
  return {group,update,traffic,people,blast,resetTraffic};
}
