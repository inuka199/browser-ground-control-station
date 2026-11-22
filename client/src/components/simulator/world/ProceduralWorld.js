import * as THREE from 'three';
import { seededRandom, staticBatch, disposeObject } from './sceneUtils.js';
import { surfaceTexture, facadeTextures, glowTexture, foliageTexture } from './cityTextures.js';
import { buildCityLife } from './CityLife.js';
import { buildPortCity } from './PortCity.js';

const ROAD_X = [65, 185, 305, 425, 545, 665, 785];
const ROAD_Z = Array.from({ length: 14 }, (_, i) => -840 + i * 120);

/** Road ribbons meeting at nearly coplanar crossings caused visible z-fighting. */
function roadSegments(start, end, intersections, halfWidth) {
  const gaps = [];
  let cursor = start;
  for (const center of intersections) {
    const gapStart = center - halfWidth;
    if (gapStart > cursor) gaps.push([cursor, gapStart]);
    cursor = Math.max(cursor, center + halfWidth);
  }
  if (cursor < end) gaps.push([cursor, end]);
  return gaps;
}

/** A Colombo-inspired coastal district, in the existing local flight coordinates. */
export function buildProceduralWorld() {
  const group = new THREE.Group(); group.name = 'Colombo coastal district';
  const random = seededRandom(42), buildingBoxes = [], windows = [], nightMaterials = [];
  const batch = staticBatch(group);
  const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...options });
  const stone = material(0xc5bfb1), concrete = material(0xd9d6ca), roof = material(0x747e80), dark = material(0x29383d), steel = material(0x636e70, { metalness: 0.75, roughness: 0.34 });
  const wood = material(0x79604a), white = material(0xd9d9cf), yellow = material(0xe9c57a);
  const asphalt = material(0x909090, { map: surfaceTexture('asphalt') });
  const paving = material(0xc7c2b7, { map: surfaceTexture('paving') });
  const grass = material(0x93ac6b, { map: surfaceTexture('grass') });
  const lamp = material(0xffe4ad, { emissive: 0xffd38b, emissiveIntensity: 0 });
  nightMaterials.push(lamp);
  const glass = material(0x597d8e, { metalness: 0.5, roughness: 0.23 });
  const facades = [0,1,2].map(style => {
    const m = material(0xffffff, { ...facadeTextures(style), metalness: style === 0 ? 0.45 : 0.08, roughness: style === 0 ? 0.3 : 0.78, emissive: 0xffffff, emissiveIntensity: 0 });
    windows.push(m); return m;
  });

  function plane(mat, x, z, width, depth, y, repeat = 1) {
    const geometry = new THREE.PlaneGeometry(width, depth); geometry.rotateX(-Math.PI / 2);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i)*width/repeat, uv.getY(i)*depth/repeat);
    const mesh = new THREE.Mesh(geometry, mat); mesh.position.set(x,y,z); mesh.receiveShadow = true; group.add(mesh); return mesh;
  }
  function collider(x, z, w, h, d, base = 0) {
    buildingBoxes.push(new THREE.Box3(new THREE.Vector3(x-w/2,base,z-d/2),new THREE.Vector3(x+w/2,base+h,z+d/2)));
  }
  function building(x,z,w,h,d,style = 0) {
    const geometry = new THREE.BoxGeometry(w,h,d);
    const uv = geometry.attributes.uv;
    // Eight windows per 24 m, sixteen floors per 56 m; no stretched mega-windows.
    for (let face=0; face<6; face++) for (let vertex=0; vertex<4; vertex++) {
      const i = face*4+vertex;
      uv.setXY(i,uv.getX(i)*(face < 2 ? d : w)/24,uv.getY(i)*(face===2 || face===3 ? d : h)/56);
    }
    batch.add(geometry,facades[style],[x,h/2,z]); geometry.dispose(); collider(x,z,w,h,d);
    batch.box(roof,[x,h+0.3,z],[w+0.6,0.6,d+0.6]);
    batch.box(concrete,[x,1.4,z],[w+1,2.8,d+1]);
    // Recessed entrance, canopy, rooftop plant and parapet.
    batch.box(glass,[x,1.55,z+d/2+0.52],[Math.min(w*0.5,9),2.7,0.12]);
    batch.box(dark,[x,3.1,z+d/2+1.4],[Math.min(w*0.6,11),0.2,3.2]);
    batch.box(steel,[x+w*0.18,h+1.2,z],[w*0.24,1.7,d*0.24]);
    batch.box(roof,[x-w*0.22,h+0.9,z-d*0.2],[3.5,1,4.5]);
    for (const side of [-1,1]) {
      batch.box(stone,[x+side*w/2,h+0.8,z],[0.3,1.1,d]);
      batch.box(stone,[x,h+0.8,z+side*d/2],[w,1.1,0.3]);
    }
    if (style > 0) for (let y=6; y<h; y+=7) batch.box(stone,[x,y,z+d/2+0.5],[w+0.8,0.4,1.4]);
  }

  // The shoreline remains open to the animated ocean. Land starts at x=-140.
  plane(stone, 930, 0, 2140, 2600, -0.24, 10);
  plane(grass,-35,0,186,1650,-0.16,7);
  plane(paving,-121,0,30,1650,0,5);
  plane(paving,0,0,75,65,0.01,5);
  plane(paving,-60,0,80,8,0.02,5);
  batch.box(stone,[-140,0.1,0],[2,1.1,1700]);
  batch.box(concrete,[-140,0.72,0],[2.4,0.22,1700]);
  // Broad sidewalks beneath each asphalt ribbon create continuous curbs.
  ROAD_X.forEach(x => {
    plane(paving,x,-60,26,1740,-0.03,5); plane(asphalt,x,-60,16,1740,0,5);
    for (let z=-914;z<805;z+=12) {
      if (ROAD_Z.some(cross => Math.abs(cross-z)<14)) continue;
      for (const offset of [-0.24,0.24]) batch.box(yellow,[x+offset,0.025,z],[0.12,0.025,6]);
    }
  });
  const crossStreetBounds = [57, 793];
  const crossStreetRuns = roadSegments(...crossStreetBounds, ROAD_X, 13);
  const crossRoadRuns = roadSegments(...crossStreetBounds, ROAD_X, 8);
  ROAD_Z.forEach(z => {
    // Stop each east-west ribbon at a north-south street. The vertical road
    // supplies the junction surface, so no two asphalt polygons overlap.
    crossStreetRuns.forEach(([from,to]) => plane(paving,(from+to)/2,z,to-from,26,-0.03,5));
    crossRoadRuns.forEach(([from,to]) => plane(asphalt,(from+to)/2,z,to-from,16,0,5));
    for (let x=crossStreetBounds[0]+8;x<crossStreetBounds[1]-3;x+=12) {
      if (ROAD_X.some(cross => Math.abs(cross-x)<14)) continue;
      batch.box(white,[x,0.042,z],[6,0.025,0.15]);
    }
    ROAD_X.forEach(x => {
      for (let stripe=-5;stripe<=5;stripe+=2) {
        batch.box(white,[x+stripe,0.055,z-10],[0.9,0.025,3]);
        batch.box(white,[x-10,0.055,z+stripe],[3,0.025,0.9]);
      }
    });
  });

  // Reserved blocks form pocket parks; buildings never intrude into the roads.
  const parks = new Set(['0:6','1:4','2:8','4:3']);
  for (let col=0;col<6;col++) for (let row=0;row<13;row++) {
    const cx=125+col*120, cz=-780+row*120;
    if (parks.has(col+':'+row)) { plane(grass,cx,cz,87,87,0.02,7); plane(paving,cx,cz,5,87,0.04,5); continue; }
    plane(paving,cx,cz,90,90,-0.01,5);
    for (const dx of [-23,23]) for (const dz of [-23,23]) {
      const h = Math.round(10+random()*28+(cz<0 && col<3 ? random()*65 : 0));
      building(cx+dx,cz+dz,25+random()*12,h,26+random()*10,Math.floor(random()*3));
    }
  }
  // Recognizable waterfront landmarks retain the existing city's identity.
  building(-25,-215,22,104,24,0); building(10,-215,22,104,24,0);
  batch.box(glass,[-7.5,61,-215],[13,3,7]); collider(-7.5,-215,13,3,7,59.5);
  building(12,-125,32,66,29,0);
  building(-45,-330,24,123,24,1);
  building(6,155,60,17,28,2);
  for (let x=-20;x<35;x+=7) batch.box(concrete,[x,5,171],[0.8,10,0.8]);
  batch.box(white,[6,10.4,172],[65,0.8,7]);

  // Lotus-inspired observation tower in a reserved park block.
  const lotus = material(0x98939d, { metalness: 0.35, roughness: 0.35, emissive: 0xa548d5, emissiveIntensity: 0 });
  nightMaterials.push(lotus);
  const shaft = new THREE.CylinderGeometry(4,7,190,32);
  batch.add(shaft,concrete,[125,95,-60]); shaft.dispose(); collider(125,-60,14,190,14);
  const petalGeo = new THREE.SphereGeometry(1,20,12);
  for(let i=0;i<8;i++) { const a=i*Math.PI/4; batch.add(petalGeo,lotus,[125+Math.sin(a)*8,181,-60+Math.cos(a)*8],[6,15,6]); }
  petalGeo.dispose();
  const deck = new THREE.CylinderGeometry(15,18,9,48);
  batch.add(deck,glass,[125,190,-60]); deck.dispose(); collider(125,-60,36,28,36,170);
  const spire = new THREE.CylinderGeometry(0.2,1.4,44,12); batch.add(spire,steel,[125,216,-60]); spire.dispose(); collider(125,-60,3,44,3,194);

  // Harbour equipment and container stacks in the northern distance.
  plane(stone,10,-980,290,250,0.1,8);
  const crane = material(0xb3a87a, { metalness: 0.5, roughness: 0.6 });
  for (let i=0;i<4;i++) {
    const x=-90+i*70;
    batch.box(crane,[x,24,-1000],[3,48,3]); batch.box(crane,[x-15,47,-1000],[60,3,3]);
    batch.box(crane,[x,44,-1000],[6,12,6]); collider(x,-1000,6,50,6);
    for (let k=0;k<4;k++) batch.box(k%2 ? dark : wood,[x,2.5+k%2*5,-900-k*14],[36,5,10]);
  }

  // Palm trees, broadleaf trees and street furniture use shared geometry.
  const bark = material(0x82705a), leaves = material(0x4e7044);
  const foliage=material(0xb9c59b,{map:foliageTexture(),alphaTest:0.48,side:THREE.DoubleSide,roughness:1});
  const trunk = new THREE.CylinderGeometry(0.19,0.34,8,9);
  const frond = new THREE.BufferGeometry();
  const vertices=[], indices=[];
  for(let i=0;i<=10;i++) {
    const t=i/10, width=0.025;
    vertices.push(t*5,Math.sin(t*Math.PI)*1.3-t*1.7,-width,t*5,Math.sin(t*Math.PI)*1.3-t*1.7,width);
    if(i<10) { const n=i*2; indices.push(n,n+1,n+2,n+1,n+3,n+2); }
  }
  for(let i=1;i<20;i++) for(const side of [-1,1]) {
    const t=i/20, y=Math.sin(t*Math.PI)*1.3-t*1.7, n=vertices.length/3;
    const span=Math.sin(Math.PI*t)*0.8;
    vertices.push(t*5,y,0,t*5+0.65,y-0.25,side*span,t*5+0.19,y+0.02,0);
    indices.push(n,n+1,n+2);
  }
  frond.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); frond.setIndex(indices); frond.computeVertexNormals(); frond.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(vertices.length/3*2),2));
  leaves.side = THREE.DoubleSide;
  const canopy = new THREE.PlaneGeometry(1,1);
  function palm(x,z,height=1) {
    batch.add(trunk,bark,[x,4*height,z],[1,height,1]);
    for(let i=0;i<8;i++) batch.add(frond,leaves,[x,8*height,z],[height,height,height],[0,i*Math.PI/4,0]);
  }
  function tree(x,z,size=1) {
    batch.add(trunk,bark,[x,2*size,z],[0.8,size*0.5,0.8]);
    for(let i=0;i<5;i++) {
      const a=i*Math.PI*0.4;
      batch.add(canopy,foliage,[x+Math.sin(a)*0.8*size,(4.8+(i%2)*0.5)*size,z+Math.cos(a)*0.8*size],[6*size,6*size,1],[0,a,0]);
    }
    for(const y of [4.5,6]) batch.add(canopy,foliage,[x,y*size,z],[5.7*size,5.7*size,1],[Math.PI/2,0,0]);
  }
  for(let z=-800;z<810;z+=30) { palm(-104,z,0.9+random()*0.3); if(Math.abs(z)>45) palm(41,z,0.8+random()*0.3); }
  for(let i=0;i<110;i++) {
    const x=98+Math.floor(random()*6)*120, z=-805+Math.floor(random()*13)*120;
    tree(x,z,0.9+random()*0.4);
  }
  for(let i=0;i<18;i++) {
    const x=-80+random()*100,z=(i<9 ? -1:1)*(45+random()*45);
    tree(x,z,0.9+random()*0.25);
  }
  trunk.dispose(); frond.dispose(); canopy.dispose();
  const poolMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0xffcf86, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const poolGeo = new THREE.PlaneGeometry(15,15); poolGeo.rotateX(-Math.PI/2);
  const pools = [];
  for(let z=-780;z<800;z+=45) for(const x of [-119,53,197,413]) {
    batch.box(steel,[x,3.5,z],[0.14,7,0.14]); batch.box(steel,[x+1.1,7,z],[2.3,0.12,0.12]);
    batch.box(lamp,[x+2.1,6.92,z],[0.8,0.12,0.42]);
    const pool = new THREE.Mesh(poolGeo,poolMat); pool.position.set(x+2.1,0.06,z); group.add(pool); pools.push(pool);
  }
  for(let z=-100;z<=100;z+=25) for(const x of [-112,25]) {
    batch.box(wood,[x,0.55,z],[3.2,0.16,0.8]); batch.box(wood,[x,1,z+0.35],[3.2,0.85,0.12]);
    for(const dx of [-1.1,1.1]) batch.box(steel,[x+dx,0.3,z],[0.12,0.6,0.8]);
  }

  const padPositions = [{x:0,z:0,label:'GALLE FACE — PAD A'},{x:125,z:-32,label:'LOTUS GARDEN — PAD B'},{x:-45,z:-170,label:'WTC — PAD C'},{x:245,z:-300,label:'PARK — PAD D'}];
  const padCanvas=document.createElement('canvas'); padCanvas.width=512; padCanvas.height=512;
  const ctx=padCanvas.getContext('2d'); ctx.fillStyle='#454f51'; ctx.fillRect(0,0,512,512);
  ctx.strokeStyle='#f2d18b'; ctx.lineWidth=10; ctx.beginPath(); ctx.arc(256,256,220,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([18,12]); ctx.lineWidth=3; ctx.beginPath(); ctx.arc(256,256,242,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle='#f1eee5'; ctx.font='bold 225px sans-serif'; ctx.textAlign='center'; ctx.fillText('H',256,332);
  ctx.font='22px sans-serif'; ctx.fillStyle='#f2d18b'; ctx.fillText('NEXUS / LANDING ZONE',256,420);
  const padTexture = new THREE.CanvasTexture(padCanvas); padTexture.colorSpace=THREE.SRGBColorSpace;
  const padMat=material(0xffffff,{map:padTexture,roughness:0.9});
  padPositions.forEach(p => {
    const pad=new THREE.Mesh(new THREE.CircleGeometry(6.5,64),padMat); pad.rotation.x=-Math.PI/2; pad.position.set(p.x,0.06,p.z); pad.receiveShadow=true; group.add(pad);
    for(let i=0;i<8;i++) { const a=i*Math.PI/4; batch.box(lamp,[p.x+Math.cos(a)*6.8,0.12,p.z+Math.sin(a)*6.8],[0.24,0.18,0.24]); }
  });
  const signCanvas=document.createElement('canvas'); signCanvas.width=1024; signCanvas.height=128;
  const signCtx=signCanvas.getContext('2d'); signCtx.fillStyle='#163536'; signCtx.fillRect(0,0,1024,128); signCtx.fillStyle='#e1d9bd'; signCtx.font='48px sans-serif'; signCtx.textAlign='center'; signCtx.fillText('GALLE FACE  /  COLOMBO',512,82);
  const signTexture=new THREE.CanvasTexture(signCanvas); signTexture.colorSpace=THREE.SRGBColorSpace;
  const sign=new THREE.Mesh(new THREE.BoxGeometry(16,2,0.25),material(0xffffff,{map:signTexture})); sign.position.set(0,2.3,-34); group.add(sign);
  for(const x of [-7,7]) batch.box(steel,[x,1,-34],[0.15,2.4,0.15]);

  const port = buildPortCity({group,building,collider});
  batch.finish();
  const life = buildCityLife(); group.add(life.group);
  const localLights = [-30,30].map(z => { const light=new THREE.PointLight(0xffd49b,0,23,2); light.position.set(4,6,z); group.add(light); return light; });
  return {
    group, padPositions, buildingBoxes, traffic:life.traffic, people:life.people, blast:life.blast, resetTraffic:life.resetTraffic,
    update(elapsed, delta, solar, options, camera) {
      port.update(elapsed,solar);
      windows.forEach(m => { m.emissiveIntensity=solar.night*1.15; });
      nightMaterials.forEach(m => { m.emissiveIntensity=solar.night*2.8; });
      poolMat.opacity=solar.night*0.36;
      pools.forEach(pool => { pool.visible=solar.night>0.01 && pool.position.distanceToSquared(camera.position)<250000; });
      localLights.forEach(light => { light.intensity=solar.night*65; });
      life.update(elapsed,delta,solar,options);
    },
    dispose() { disposeObject(group); },
  };
}
