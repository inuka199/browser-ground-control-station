import * as THREE from 'three';

// Concentrate vertices near the waterfront; stretch the same surface to the horizon.
// One continuous mesh avoids seams and overlapping near/far water planes.
export function oceanGeometry(quality = 'balanced') {
  const step=quality==='low' ? 32 : quality==='high' ? 12 : 20;
  const xs=[-14000,-9000,-5000,-3000], zs=[-10000,-6000,-3500];
  for(let x=-2400;x<=1000;x+=step) xs.push(x);
  xs.push(2500,5000,8000);
  for(let z=-2500;z<=2000;z+=step) zs.push(z);
  zs.push(3500,6000,10000);
  const vertices=[],indices=[];
  zs.forEach(z=>xs.forEach(x=>vertices.push(x,0,z)));
  for(let j=0;j<zs.length-1;j++) for(let i=0;i<xs.length-1;i++) {
    const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geometry.setIndex(indices);geometry.computeBoundingSphere();
  return geometry;
}

export const waterVertex=/* glsl */`
#include <common>
#include <logdepthbuf_pars_vertex>
uniform float time;
varying vec3 vWorld, vNormal;
void main() {
  vec3 p=position;
  float a=dot(p.xz,vec2(0.028,0.014))-time*0.8;
  float b=dot(p.xz,vec2(-0.048,0.038))-time*1.05;
  float c=dot(p.xz,vec2(0.085,0.062))-time*1.45;
  float coast=1.0-smoothstep(-200.0,-140.0,p.x);
  float amplitude=0.24+coast*0.76;
  p.y+=(sin(a)*0.42+sin(b)*0.22+sin(c)*0.09)*amplitude;
  vNormal=normalize(vec3(-amplitude*(cos(a)*0.01176-cos(b)*0.01056+cos(c)*0.00765),1.0,-amplitude*(cos(a)*0.00588+cos(b)*0.00836+cos(c)*0.00558)));
  vWorld=(modelMatrix*vec4(p,1.0)).xyz;
  gl_Position=projectionMatrix*viewMatrix*vec4(vWorld,1.0);
  #include <logdepthbuf_vertex>
}`;

export const waterFragment=/* glsl */`
#include <logdepthbuf_pars_fragment>
uniform float time, daylight, golden, fogDensity;
uniform vec3 sunDirection, fogColor;
varying vec3 vWorld,vNormal;
void main() {
  #include <logdepthbuf_fragment>
  float d=length(cameraPosition-vWorld);
  // Filter short ripples at distance: unfiltered normals glitter at high altitude.
  float detail=(1.0-smoothstep(80.0,700.0,d))/(1.0+length(fwidth(vWorld.xz))*2.0);
  vec3 normal=normalize(vNormal+vec3(sin(vWorld.z*1.2+time*2.1)*0.09,0.0,cos(vWorld.x*1.4+vWorld.z*0.6-time*1.7)*0.07)*detail);
  vec3 viewDir=normalize(cameraPosition-vWorld);
  float fresnel=0.08+0.92*pow(1.0-max(dot(viewDir,normal),0.0),4.0);
  float shore=1.0-smoothstep(2.0,40.0,abs(vWorld.x+145.0));
  float port=step(-785.0,vWorld.z)*step(vWorld.z,-355.0);
  shore=max(shore,(1.0-smoothstep(1.0,18.0,abs(vWorld.x+452.0)))*port);
  vec3 deep=mix(vec3(0.004,0.018,0.033),mix(vec3(0.018,0.12,0.17),vec3(0.06,0.32,0.31),shore),daylight);
  vec3 reflection=mix(vec3(0.025,0.055,0.10),mix(vec3(0.42,0.64,0.75),vec3(0.76,0.48,0.27),golden),daylight);
  vec3 color=mix(deep,reflection,fresnel);
  vec3 lightDir=daylight>0.05 ? sunDirection : -sunDirection;
  float spec=pow(max(dot(reflect(-lightDir,normal),viewDir),0.0),110.0);
  color+=mix(vec3(0.35,0.50,0.72),vec3(1.0,0.77,0.45),daylight)*spec*(0.3+daylight*2.0);
  float breaker=sin(vWorld.x*0.38+sin(vWorld.z*0.08)*1.3-time*1.8);
  float foam=shore*smoothstep(0.62,0.94,breaker);
  foam*=0.7+0.3*sin(vWorld.z*2.1+time);
  color=mix(color,mix(vec3(0.11,0.17,0.20),vec3(0.73,0.84,0.81),daylight),foam*0.75);
  color=mix(color,fogColor,1.0-exp(-fogDensity*fogDensity*d*d));
  gl_FragColor=vec4(color,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
