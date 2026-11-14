import * as THREE from 'three';

export function createExplosionEffects(scene) {
  const group=new THREE.Group(); scene.add(group);
  const sphere=new THREE.SphereGeometry(1,8,6),fragment=new THREE.BoxGeometry(1,1,1);
  const bursts=[];
  function remove(burst) {
    group.remove(burst.group);
    burst.group.traverse(object=>{ if(object.material) object.material.dispose(); });
    burst.light.dispose();
    burst.ring.geometry.dispose();
  }
  function explode(position,scale=1,drone=false) {
    if(bursts.length>=6) remove(bursts.shift());
    const root=new THREE.Group();root.position.set(position.x,Math.max(0.5,position.y),position.z);group.add(root);
    const parts=[];
    for(let i=0;i<48;i++) {
      const smoke=i>=28,debris=i<12;
      const material=debris ? new THREE.MeshStandardMaterial({color:drone ? 0x94a5ad : 0x373f43,roughness:0.8}) : new THREE.MeshBasicMaterial({color:smoke ? 0x50535a : i%2 ? 0xffb442 : 0xff5421,transparent:true,opacity:smoke ? 0.65 : 1,depthWrite:false});
      const mesh=new THREE.Mesh(debris ? fragment : sphere,material);
      const size=debris ? 0.1+Math.random()*0.25 : 0.3+Math.random()*0.7;
      mesh.scale.setScalar(size*scale);
      if(debris && drone) mesh.scale.x*=4;
      const velocity=new THREE.Vector3((Math.random()-0.5)*18,3+Math.random()*12,(Math.random()-0.5)*18).multiplyScalar(scale);
      if(smoke) velocity.multiplyScalar(0.22);
      root.add(mesh);parts.push({mesh,velocity,smoke,debris,size:size*scale});
    }
    const light=new THREE.PointLight(0xff8238,100*scale,35*scale,2);root.add(light);
    const ring=new THREE.Mesh(new THREE.TorusGeometry(1,0.05,5,48),new THREE.MeshBasicMaterial({color:0xffc67b,transparent:true,opacity:0.8,depthWrite:false}));
    ring.rotation.x=-Math.PI/2;ring.position.y=-root.position.y+0.12;root.add(ring);
    bursts.push({group:root,parts,light,ring,age:0,scale});
  }
  return {
    explode,
    clear() {bursts.forEach(remove);bursts.length=0;},
    update(delta) {
      for(let i=bursts.length-1;i>=0;i--) {
        const burst=bursts[i];burst.age+=delta;
        burst.light.intensity=Math.max(0,1-burst.age/0.45)*100*burst.scale;
        burst.ring.scale.setScalar(1+burst.age*16);burst.ring.material.opacity=Math.max(0,0.8-burst.age*1.8);
        burst.parts.forEach(part=>{
          const {mesh,velocity,smoke,debris,size}=part;
          mesh.position.addScaledVector(velocity,delta);
          if(!smoke) velocity.y-=delta*9.8;
          else {velocity.x*=Math.exp(-delta);velocity.z*=Math.exp(-delta);velocity.y+=delta*0.5;}
          const floor=0.1-burst.group.position.y;
          if(mesh.position.y<floor) {mesh.position.y=floor;velocity.y=Math.abs(velocity.y)*0.25;velocity.x*=0.8;velocity.z*=0.8;}
          mesh.rotation.x+=delta*(debris ? 4 : 0.2);mesh.rotation.z+=delta*2;
          if(!debris) {mesh.scale.setScalar(size*(1+burst.age*(smoke ? 1.8 : 2)));mesh.material.opacity=Math.max(0,(smoke ? 0.65 : 1)-burst.age/(smoke ? 7 : 0.8));}
        });
        if(burst.age>5) {remove(burst);bursts.splice(i,1);}
      }
    },
    dispose() {bursts.forEach(remove);bursts.length=0;scene.remove(group);sphere.dispose();fragment.dispose();},
  };
}
