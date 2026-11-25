import * as THREE from 'three';
import { coastX } from './coastalTerrain.js';

// Direction, wavelength in metres, vertical amplitude and horizontal excursion.
const swells = [[0.93,0.37,92,1.45,1.7],[0.76,-0.65,57,0.65,0.85],[0.35,0.94,34,0.28,0.38]].map(
  ([x,z,length,height,push]) => {
    const k=2*Math.PI/length, norm=Math.hypot(x,z);
    return {x:x/norm,z:z/norm,k,omega:Math.sqrt(9.81*k),height,push};
  });
function ramp(distance, span) {
  const t=Math.max(0,Math.min(1,distance/span));
  return t*t*(3-2*t);
}
function swellWeight(x,z) {
  const portDistance=Math.hypot(Math.max(-525-x,0,x+140), Math.max(-947-z,0,z+355));
  const nearLand=Math.min(ramp(-140-x,110),ramp(portDistance,80));
  const detail=ramp(x+2300,650)*ramp(2200-Math.abs(z),700);
  return (0.13+0.87*nearLand)*detail;
}
export function sampleSwell(x,z,time) {
  const weight=swellWeight(x,z);
  let dx=0,dz=0,y=0,slopeX=0,slopeZ=0;
  for(const w of swells) {
    const phase=w.k*(w.x*x+w.z*z)-w.omega*time;
    const c=weight*Math.cos(phase), s=weight*Math.sin(phase);
    dx+=w.x*w.push*c; dz+=w.z*w.push*c; y+=w.height*s;
    slopeX+=w.x*w.k*w.height*c; slopeZ+=w.z*w.k*w.height*c;
  }
  return {dx,dz,y,slopeX,slopeZ};
}

function axis(coarse,fineStart,fineEnd,spacing) {
  const result=new Set(coarse);
  for(let v=fineStart;v<=fineEnd;v+=spacing)result.add(v);
  return [...result].sort((a,b)=>a-b);
}

// Concentrate vertices near the waterfront; stretch the same surface to the horizon.
// One continuous mesh avoids seams and overlapping near/far water planes.
export function oceanGeometry(quality = 'balanced') {
  const step=quality==='low' ? 16 : quality==='high' ? 5 : 8;
  const outerX=axis([-14000,-9000,-5000,-3000,1000,2500,5000,8000],-2400,-800,step*3);
  const outerZ=axis([-10000,-6000,-3500,3500,6000,10000],-2500,2200,step*3);
  const xs=axis(outerX,-800,-120,step), zs=axis(outerZ,-1050,750,step);
  const vertices=[],indices=[],weights=[];
  zs.forEach(z=>xs.forEach(x=>{vertices.push(x,0,z);weights.push(swellWeight(x,z));}));
  for(let j=0;j<zs.length-1;j++) for(let i=0;i<xs.length-1;i++) {
    const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setAttribute('swellWeight',new THREE.Float32BufferAttribute(weights,1));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

// One continuous water surface. Carry wave phases across changes of local origin.
export function buildOpenOcean(localOcean) {
  const material=localOcean.material.clone();
  material.defines={STREAM_OCEAN:1};
  material.uniforms={...localOcean.material.uniforms, wavePhase:{value:new THREE.Vector3()}, rippleOffset:{value:new THREE.Vector2()}};
  const mesh=new THREE.Mesh(new THREE.BufferGeometry(),material);
  mesh.frustumCulled=false;
  let previousShape='', anchored=false;
  function update(camera,quality,reach) {
    const step=quality==='low'?16:quality==='high'?5:8;
    const shape=step+'/'+reach;
    if(shape!==previousShape) {
      previousShape=shape; anchored=false;
      const half=[];
      for(let n=0;n<=256;n+=step) half.push(n);
      for(let n=304;n<reach;n*=1.6) half.push(n);
      half.push(reach);
      const axis=[...half.slice(1).reverse().map(v=>-v),...half], width=axis.length;
      const vertices=[],indices=[];
      for(let j=0;j<width;j++) for(let i=0;i<width;i++) {
        vertices.push(axis[i],0,axis[j]);
        const a=j*width+i;
        if(i+1<width && j+1<width) indices.push(a,a+width,a+1,a+1,a+width,a+width+1);
      }
      mesh.geometry.dispose();
      const geo=new THREE.BufferGeometry(); mesh.geometry=geo;
      geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
      geo.setAttribute('waterfront',new THREE.Float32BufferAttribute(new Float32Array(width*width*2),2).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('swellWeight',new THREE.Float32BufferAttribute(new Float32Array(width*width),1).setUsage(THREE.DynamicDrawUsage));
      geo.setIndex(indices);
    }
    const x0=Math.round(camera.x/32)*32, z0=Math.round(camera.z/32)*32;
    if(anchored && x0===mesh.position.x && z0===mesh.position.z) return;
    anchored=true; mesh.position.set(x0,-0.9,z0);
    const {position,waterfront,swellWeight:weight}=mesh.geometry.attributes;
    let lastZ=NaN, coast=0;
    for(let i=0;i<position.count;i++) {
      const px=position.getX(i), pz=position.getZ(i), x=x0+px, z=z0+pz;
      if(z!==lastZ) { coast=coastX(z); lastZ=z; }
      const portDistance=Math.hypot(Math.max(-525-x,0,x+140),Math.max(-947-z,0,z+355));
      const offshore=Math.min(ramp(coast-x,110),ramp(portDistance,80));
      weight.setX(i,(0.13+0.87*offshore)*(1-ramp(Math.max(Math.abs(px),Math.abs(pz))-160,140)));
      waterfront.setXY(i,x-coast+5,z>-785 && z<-355 ? 1-ramp(Math.abs(x+452)-1,17):0);
    }
    weight.needsUpdate=waterfront.needsUpdate=true;
    const tau=2*Math.PI;
    swells.forEach((w,i)=>material.uniforms.wavePhase.value.setComponent(i,(w.k*(w.x*x0+w.z*z0))%tau));
    material.uniforms.rippleOffset.value.set(x0%(tau*50),z0%(tau*50));
  }
  return {mesh,update,dispose(){mesh.geometry.dispose();material.dispose();}};
}

export const waterVertex=/* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float time;
uniform vec3 wavePhase;
uniform vec2 rippleOffset;
attribute float swellWeight;
varying vec3 vWorld, vNormal, vToEye;
#ifdef STREAM_OCEAN
attribute vec2 waterfront;
varying vec2 vWaterfront;
#endif
varying float vCrest;
void swell(vec2 dir,float k,float omega,float height,float push,float originPhase,inout vec3 p,inout vec3 tx,inout vec3 tz) {
  float phase=k*dot(dir,position.xz)+originPhase-omega*time;
  float c=cos(phase)*swellWeight, s=sin(phase)*swellWeight;
  p+=vec3(dir.x*push*c,height*s,dir.y*push*c);
  vec3 derivative=vec3(-dir.x*push*s,height*c,-dir.y*push*s)*k;
  tx+=derivative*dir.x; tz+=derivative*dir.y;
}
void main() {
  vec3 p=position;
  vec3 tx=vec3(1.,0.,0.), tz=vec3(0.,0.,1.);
  ${swells.map((w,i)=>'swell(vec2('+w.x.toFixed(8)+','+w.z.toFixed(8)+'),'+[w.k,w.omega,w.height,w.push].map(v=>v.toFixed(8)).join(',')+',wavePhase['+i+'],p,tx,tz);').join('\n  ')}
  vNormal=normalize(cross(tz,tx)); vCrest=p.y;
  vWorld=p+vec3(rippleOffset.x,0.,rippleOffset.y);
  #ifdef STREAM_OCEAN
    vWaterfront=waterfront;
  #endif
  vec4 eye=modelViewMatrix*vec4(p,1.0);
  vToEye=-(vec4(eye.xyz,0.0)*viewMatrix).xyz;
  gl_Position=projectionMatrix*eye;
  #include <logdepthbuf_vertex>
}`;

export const waterFragment=/* glsl */`
#include <logdepthbuf_pars_fragment>
uniform float time, daylight, golden, fogDensity;
uniform float rainAmount, lightning;
uniform vec3 sunDirection, fogColor;
varying vec3 vWorld,vNormal,vToEye;
#ifdef STREAM_OCEAN
varying vec2 vWaterfront;
#endif
varying float vCrest;
void main() {
  #include <logdepthbuf_fragment>
  float d=length(vToEye);
  // Filter short ripples at distance: unfiltered normals glitter at high altitude.
  float detail=(1.0-smoothstep(80.0,700.0,d))/(1.0+length(fwidth(vWorld.xz))*2.0);
  vec3 normal=normalize(vNormal+vec3(sin(vWorld.z*1.2+time*2.1)*0.09,0.0,cos(vWorld.x*1.4+vWorld.z*0.6-time*1.7)*0.07)*detail);
  vec3 viewDir=normalize(vToEye);
  float fresnel=0.08+0.92*pow(1.0-max(dot(viewDir,normal),0.0),4.0);
  float shore=1.0-smoothstep(2.0,40.0,abs(vWorld.x+145.0));
  float port=step(-785.0,vWorld.z)*step(vWorld.z,-355.0);
  shore=max(shore,(1.0-smoothstep(1.0,18.0,abs(vWorld.x+452.0)))*port);
  #ifdef STREAM_OCEAN
    shore=max(1.0-smoothstep(2.0,40.0,abs(vWaterfront.x)),vWaterfront.y);
  #endif
  vec3 deep=mix(vec3(0.004,0.018,0.033),mix(vec3(0.018,0.12,0.17),vec3(0.06,0.32,0.31),shore),daylight);
  vec3 reflection=mix(vec3(0.025,0.055,0.10),mix(vec3(0.42,0.64,0.75),vec3(0.76,0.48,0.27),golden),daylight);
  vec3 color=mix(deep,reflection,fresnel);
  color *= 1.0-rainAmount*0.38;
  vec3 lightDir=daylight>0.05 ? sunDirection : -sunDirection;
  float spec=pow(max(dot(reflect(-lightDir,normal),viewDir),0.0),110.0);
  color+=mix(vec3(0.35,0.50,0.72),vec3(1.0,0.77,0.45),daylight)*spec*(0.3+daylight*2.0);
  float breaker=sin(vWorld.x*0.38+sin(vWorld.z*0.08)*1.3-time*1.8);
  float foam=max(shore*smoothstep(0.62,0.94,breaker),smoothstep(1.32,2.10,vCrest)*0.82);
  foam*=0.7+0.3*sin(vWorld.z*2.1+time);
  #ifdef STREAM_OCEAN
    foam*=1.0-smoothstep(230.,1200.,d);
  #endif
  color=mix(color,mix(vec3(0.11,0.17,0.20),vec3(0.73,0.84,0.81),daylight),foam*0.75);
  color+=vec3(0.09,0.12,0.17)*lightning*fresnel;
  color=mix(color,fogColor,1.0-exp(-fogDensity*fogDensity*d*d));
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
