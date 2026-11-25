import * as THREE from 'three';
import { COAST_X, GRID, LANDMARK_SPACING, blend, coastX, hasLand, landmarkAt, roadsAt, terrainHeight, viewRange } from './coastalTerrain.js';

const subdivisions=16;
const smallest=GRID*subdivisions;
const qualityRadius={low:0.55, balanced:1, high:1.5};
const sand=new THREE.Color(0xc4b181), grass=new THREE.Color(0x718853), forest=new THREE.Color(0x385c48), rock=new THREE.Color(0x858375);
const color=new THREE.Color();

function terrainMaterial(radius) {
  const material=new THREE.MeshLambertMaterial({vertexColors:true});
  material.onBeforeCompile=shader=>{
    shader.uniforms.detailRadius=radius;
    shader.vertexShader='attribute vec2 roads; attribute vec4 lod; uniform float detailRadius; varying vec2 vRoad; varying vec2 vField;\n'+shader.vertexShader.replace('#include <begin_vertex>',`
      #include <begin_vertex>
      vRoad=roads;
      vField=vec2(roads.x,roads.y);
      vec3 eye=-(vec4((modelViewMatrix*vec4(0.,0.,0.,1.)).xyz,0.)*viewMatrix).xyz;
      vec2 gap=max(abs(eye.xz-lod.xy)-vec2(lod.z),vec2(0.));
      float range=max(max(gap.x,gap.y),eye.y-650.)/(2.*lod.z);
      transformed.y+=lod.w*smoothstep(0.58*detailRadius,0.93*detailRadius,range);
    `);
    shader.fragmentShader='varying vec2 vRoad; varying vec2 vField;\n'+shader.fragmentShader.replace('#include <color_fragment>',`
      #include <color_fragment>
      vec2 farm=floor(vField/vec2(96.,120.));
      float fieldTone=sin(farm.x*1.8+cos(mod(farm.y,8.)*1.7));
      float pasture=smoothstep(50.,400.,vRoad.x)*(1.-smoothstep(3.,22.,fwidth(vField.y)));
      diffuseColor.rgb*=mix(vec3(1.),vec3(1.+0.13*fieldTone,1.+0.08*fieldTone,1.-0.06*fieldTone),pasture);
      float across=abs(mod(vRoad.y+480.0,960.0)-480.0);
      float aa=max(0.5,fwidth(vRoad.y));
      float sideRoad=(1.0-smoothstep(3.0,3.0+aa,across))*(1.0-smoothstep(5.0,26.0,aa))*smoothstep(-5.0,5.0,vRoad.x);
      aa=max(0.5,fwidth(vRoad.x));
      float trunk=(1.0-smoothstep(7.0,7.0+aa,abs(vRoad.x)))*(1.0-smoothstep(8.0,40.0,aa));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.11,0.12,0.115),max(trunk,sideRoad));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(0.67,0.58,0.36),(1.0-smoothstep(0.18,0.18+aa,abs(vRoad.x)))*trunk/(1.0+aa));
    `);
  };
  return material;
}

function buildTile(i,j,size,material) {
  const x0=COAST_X+i*size, z0=j*size, n=subdivisions, step=size/n;
  const vertices=[], colors=[], roads=[], indices=[], edge=[];
  const roadPeriod=Math.floor(z0/960)*960;
  for(let row=0;row<=n;row++) {
    for(let col=0;col<=n;col++) {
      const x=x0+col*step, z=z0+row*step, y=terrainHeight(x,z);
      vertices.push(col*step,y,row*step);
      const inland=x-coastX(z);
      color.copy(sand).lerp(grass,Math.max(blend(12,130,inland),blend(3,22,y))).lerp(forest,blend(30,300,y)).lerp(rock,blend(330,520,y));
      color.multiplyScalar(0.96 + 0.04*Math.sin(x/84+Math.cos(z/115)));
      colors.push(color.r,color.g,color.b);
      const [main,cross]=roadsAt(x,z);
      roads.push(main,cross-roadPeriod);
      const a=row*(n+1)+col, b=a+1, c=a+n+1;
      if(row<n && col<n) indices.push(a,c,b,b,c,c+1);
    }
  }
  // Skirts cover the difference between fine and coarse edge samples at LOD boundaries.
  for(let k=0;k<n;k++) edge.push(k);
  for(let k=0;k<n;k++) edge.push(k*(n+1)+n);
  for(let k=n;k>0;k--) edge.push(n*(n+1)+k);
  for(let k=n;k>0;k--) edge.push(k*(n+1));
  const first=vertices.length/3;
  edge.forEach((idx,k)=>{
    vertices.push(vertices[idx*3],vertices[idx*3+1]-Math.min(720,step*1.8),vertices[idx*3+2]);
    colors.push(...colors.slice(idx*3,idx*3+3));
    roads.push(roads[idx*2],roads[idx*2+1]);
    const next=(k+1)%edge.length;
    indices.push(idx,edge[next],first+k,edge[next],first+next,first+k);
  });
  // At a split or merge, move each fine vertex onto the parent triangle.
  const lod=[], parentX=(i%2===0?1:0)*size, parentZ=(j%2===0?1:0)*size;
  for(let k=0;k<vertices.length/3;k++) {
    const top=k<first?k:edge[k-first], row=Math.floor(top/(n+1)), col=top%(n+1);
    const dx=col%2, dz=row%2;
    const delta=dx||dz ? (vertices[(top-dx+dz*(n+1))*3+1]+vertices[(top+dx-dz*(n+1))*3+1])/2-vertices[top*3+1] : 0;
    lod.push(parentX,parentZ,size,delta);
  }
  const geo=new THREE.BufferGeometry();
  for(const [name,data,width] of [['position',vertices,3],['color',colors,3],['roads',roads,2],['lod',lod,4]]) {
    geo.setAttribute(name,new THREE.Float32BufferAttribute(data,width));
  }
  geo.setIndex(indices); geo.computeVertexNormals(); geo.computeBoundingSphere();
  const mesh=new THREE.Mesh(geo,material);
  // Keep GPU vertices local. Three subtracts the camera in double precision
  // when composing each tile's modelViewMatrix.
  mesh.position.set(x0,0,z0);
  return mesh;
}

export function buildStreamingCoast() {
  const group=new THREE.Group(), tiles=new Map(), landmarks=new Map();
  const radius={value:1}, land=terrainMaterial(radius);
  const stone=new THREE.MeshLambertMaterial({color:0xcac3a8});
  const copper=new THREE.MeshLambertMaterial({color:0x658682});
  const lamp=new THREE.MeshBasicMaterial({color:0xffdfa0});
  const shaft=new THREE.CylinderGeometry(0.68,1,1,10), dome=new THREE.SphereGeometry(1,10,6), rim=new THREE.CylinderGeometry(1,1,1,10);
  let previousKey='', previousDistrict='';
  function updateLandmarks(point) {
    const i=Math.floor(point.x/LANDMARK_SPACING), j=Math.floor(point.z/LANDMARK_SPACING);
    const district=i+','+j;
    if(district!==previousDistrict) {
      previousDistrict=district;
      const keep=new Set();
      // The coastal light follows the shore, which can cross the zero grid column.
      for(const col of new Set([i-1,i,i+1,0])) for(let row=j-1;row<=j+1;row++) {
        const site=landmarkAt(col,row);
        if(!site || Math.abs(site.x-point.x)>3*LANDMARK_SPACING) continue;
        keep.add(site.name);
        if(landmarks.has(site.name)) continue;
        const landmark=new THREE.Group();
        const height=site.coastal?32:18, radius=site.coastal?4:8;
        for(const [geo,mat,y,sx,sy] of [[shaft,stone,height/2,radius,height],[rim,copper,height,radius+1,2],[dome,site.coastal?lamp:copper,height+2,radius,site.coastal?3:7]]) {
          const mesh=new THREE.Mesh(geo,mat); mesh.scale.set(sx,sy,sx); mesh.position.y=y; landmark.add(mesh);
        }
        landmark.position.set(site.x,site.y,site.z);
        const box=new THREE.Box3().setFromObject(landmark);
        group.add(landmark); landmarks.set(site.name,{landmark,site,box});
      }
      for(const [key,{landmark}] of landmarks) if(!keep.has(key)) { group.remove(landmark); landmarks.delete(key); }
    }
  }
  function update(camera,quality) {
    radius.value=qualityRadius[quality];
    const root=2**Math.ceil(Math.log2(viewRange(camera.y)));
    const snap=smallest/4;
    const x=Math.floor((camera.x-COAST_X)/snap)*snap, z=Math.floor(camera.z/snap)*snap;
    const altitude=Math.floor(Math.max(0,camera.y-650)/snap)*snap;
    const key=[x,z,altitude,quality,root].join('/');
    if(key===previousKey) return;
    previousKey=key;
    const keep=new Set();
    function visit(i,j,size) {
      if(!hasLand(COAST_X+i*size,j*size,size)) return;
      const dx=Math.max(i*size-x,0,x-(i+1)*size), dz=Math.max(j*size-z,0,z-(j+1)*size);
      if(size>smallest && Math.max(dx,dz,altitude)<size*qualityRadius[quality]) {
        for(let rz=0;rz<2;rz++) for(let cx=0;cx<2;cx++) visit(i*2+cx,j*2+rz,size/2);
      } else {
        const id=[size,i,j].join('/');
        keep.add(id);
        if(!tiles.has(id)) {
          const mesh=buildTile(i,j,size,land); group.add(mesh); tiles.set(id,mesh);
        }
      }
    }
    const rx=Math.floor(x/root), rz=Math.floor(z/root);
    for(let j=rz-1;j<=rz+1;j++) for(let i=rx-1;i<=rx+1;i++) visit(i,j,root);
    for(const [id,mesh] of tiles) if(!keep.has(id)) {
      group.remove(mesh); mesh.geometry.dispose(); tiles.delete(id);
    }
  }
  function dispose() {
    for(const mesh of tiles.values()) mesh.geometry.dispose();
    for(const asset of [land,stone,copper,lamp,shaft,dome,rim]) asset.dispose();
    group.clear(); tiles.clear(); landmarks.clear();
  }
  return {group,update,updateLandmarks,landmarks,tiles,dispose};
}

