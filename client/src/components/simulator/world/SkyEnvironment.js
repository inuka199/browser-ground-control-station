import * as THREE from 'three';
import { solarState } from './environmentMath.js';
import { seededRandom, disposeObject } from './sceneUtils.js';
import { glowTexture } from './cityTextures.js';
import { waterVertex, waterFragment, oceanGeometry } from './OceanSurface.js';
import { buildStormEffects } from './StormEffects.js';
import { buildCloudLayer } from './CloudLayer.js';

const skyVertex = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  #include <logdepthbuf_vertex>
}`;
const skyFragment = /* glsl */ `
#include <logdepthbuf_pars_fragment>
uniform vec3 sunDirection;
uniform float daylight, golden, haze;
uniform float rainAmount, lightning;
uniform float openHorizon;
uniform vec3 horizonFog;
varying vec3 vDirection;
void main() {
  #include <logdepthbuf_fragment>
  vec3 ray = normalize(vDirection);
  float height = max(ray.y, 0.0);
  vec3 zenith = mix(vec3(0.004,0.009,0.027), vec3(0.12,0.34,0.63), daylight);
  vec3 horizon = mix(vec3(0.028,0.048,0.09), vec3(0.62,0.76,0.83), daylight);
  horizon = mix(horizon, vec3(0.95,0.45,0.21), golden * 0.62);
  vec3 color = mix(horizon, zenith, pow(height, 0.45 + haze * 0.15));
  float sunDot = max(dot(ray, sunDirection), 0.0);
  color += vec3(1.0,0.69,0.36) * pow(sunDot, 18.0) * (0.16 + golden * 0.42) * daylight;
  color += vec3(4.0,3.3,2.2) * smoothstep(0.99972,0.9999,sunDot) * daylight;
  color = mix(color, mix(vec3(0.014,0.019,0.033),vec3(0.19,0.23,0.28),daylight),rainAmount*0.86);
  color = mix(color,horizonFog,openHorizon*(1.0-smoothstep(0.0,0.13,abs(max(ray.y,0.0)))));
  gl_FragColor = vec4(color + vec3(0.18,0.21,0.28)*lightning, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
/** Local metre-based atmosphere. Its elapsed clock freezes with the simulation. */
export function buildSkyEnvironment(scene) {
  const group = new THREE.Group(); scene.add(group);
  const updatePrecipitation = buildStormEffects(group);
  const uniforms = {
    time: { value: 0 }, daylight: { value: 1 }, golden: { value: 0 }, haze: { value: 0.35 },
    sunDirection: { value: new THREE.Vector3() },
    rainAmount: { value: 0 }, lightning: { value: 0 }, openHorizon:{value:0}, horizonFog:{value:new THREE.Color()},
  };
  const updateClouds = buildCloudLayer(group, uniforms);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), new THREE.ShaderMaterial({
    uniforms, vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false,
  }));
  sky.renderOrder = -10; group.add(sky);
  const fog = new THREE.FogExp2(0x96b5c9, 0.00045); scene.fog = fog;
  const waterUniforms = { ...uniforms, fogColor: { value: fog.color }, fogDensity: { value: fog.density } };
  const waterGeometry = oceanGeometry();
  const ocean = new THREE.Mesh(waterGeometry, new THREE.ShaderMaterial({ uniforms: waterUniforms, vertexShader: waterVertex, fragmentShader: waterFragment }));
  ocean.position.set(0, -0.9, 0); group.add(ocean);
  const random = seededRandom(135), starPositions = [];
  for (let i = 0; i < 1400; i++) {
    const y = random(), angle = random() * Math.PI * 2, radius = Math.sqrt(1 - y*y);
    starPositions.push(Math.cos(angle)*radius*8500, y*8500, Math.sin(angle)*radius*8500);
  }
  const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xdbe9ff, size: 1.4, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false })); group.add(stars);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xdbedff, transparent: true, depthWrite: false, fog: false })); moon.scale.set(190,190,1); group.add(moon);
  const moonDisc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, depthWrite: false, fog: false })); moonDisc.scale.set(44,44,1); group.add(moonDisc);
  stars.renderOrder = moon.renderOrder = moonDisc.renderOrder = -2;
  const ambient = new THREE.HemisphereLight(0xc4deef, 0x807257, 1.5); group.add(ambient);
  const sun = new THREE.DirectionalLight(0xffefda, 3.5); sun.castShadow = true;
  sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.near = 1; sun.shadow.camera.far = 1200;
  sun.shadow.camera.left = sun.shadow.camera.bottom = -140; sun.shadow.camera.right = sun.shadow.camera.top = 140;
  sun.shadow.normalBias = 0.45; sun.shadow.bias = -0.00015; sun.shadow.radius = 2;
  group.add(sun, sun.target);
  const moonlight = new THREE.DirectionalLight(0x9fbfff, 0.3); group.add(moonlight, moonlight.target);
  const daylightFog = new THREE.Color(0xa3bdc9), sunsetFog = new THREE.Color(0xbe9277), nightFog = new THREE.Color(0x111e33);
  let quality, wind, baseFogDensity;
  function update(elapsed, options, camera, focus, weather) {
    const state = solarState(options.timeOfDay);
    wind = options.wind;
    uniforms.rainAmount.value = weather.rain; uniforms.lightning.value = weather.flash;
    uniforms.time.value = elapsed; uniforms.daylight.value = state.daylight; uniforms.golden.value = state.golden; uniforms.haze.value = options.haze;
    const direction = uniforms.sunDirection.value.set(Math.cos(state.angle) * 0.82, state.elevation, -0.36).normalize();
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    stars.material.opacity = state.night * 0.85 * (1-weather.rain); stars.visible = state.night > 0.01;
    moon.position.copy(camera.position).addScaledVector(direction, -8200); moonDisc.position.copy(moon.position);
    moon.material.opacity = moonDisc.material.opacity = state.night * (1-weather.rain);
    sun.color.setRGB(1, 0.96 - state.golden * 0.34, 0.86 - state.golden * 0.48);
    sun.intensity = state.daylight * (3.1 - state.golden * 0.9) * (1 - weather.rain * 0.75);
    const texel = 280 / sun.shadow.mapSize.x;
    sun.target.position.set(Math.round(focus.x / texel)*texel, 0, Math.round(focus.z / texel)*texel);
    sun.position.copy(sun.target.position).addScaledVector(direction, 500);
    ambient.intensity = 0.24 + state.daylight * (1.5 - weather.rain * 0.52) + weather.flash * 0.65; ambient.color.set(state.daylight > 0.2 ? 0xc4deef : 0x718fbe);
    moonlight.intensity = state.night * 0.55; moonlight.target.position.copy(focus); moonlight.position.copy(focus).addScaledVector(direction,-500);
    fog.color.copy(nightFog).lerp(daylightFog, state.daylight).lerp(sunsetFog, state.golden * 0.5);
    fog.color.multiplyScalar(1-weather.rain*0.44);
    baseFogDensity = 0.00022 + options.haze * 0.00075 + weather.rain * 0.00095;
    fog.density = waterUniforms.fogDensity.value = baseFogDensity;
    scene.environmentIntensity = 0.12 + state.daylight * 0.65;
    if (quality !== options.quality) {
      quality = options.quality; sun.castShadow = quality !== 'low';
      ocean.geometry.dispose(); ocean.geometry = oceanGeometry(quality);
      const size = quality === 'high' ? 2048 : 1024;
      sun.shadow.mapSize.set(size,size); sun.shadow.map?.dispose(); sun.shadow.map = null;
    }
    return state;
  }
  // Sample the active camera after its rig has moved, including while paused.
  function updateCameraWeather(elapsed, weather, quality, camera, offline, reach=0) {
    const water = updateClouds(elapsed, wind, weather.rain, quality, camera, offline);
    const air=reach ? Math.max(3/reach,baseFogDensity/(1+Math.max(0,camera.position.y-150)/500)) : baseFogDensity;
    fog.density = waterUniforms.fogDensity.value = air + water * 0.033;
    uniforms.openHorizon.value=reach?1:0;
    uniforms.horizonFog.value.copy(fog.color);
    const scale=reach ? Math.max(1,camera.far/10500) : 1;
    sky.scale.setScalar(scale); stars.scale.setScalar(scale);
    sky.position.copy(camera.position); stars.position.copy(camera.position);
    moon.position.copy(camera.position).addScaledVector(uniforms.sunDirection.value,-8200*scale);
    moonDisc.position.copy(moon.position); moon.scale.setScalar(190*scale); moonDisc.scale.setScalar(44*scale);
    updatePrecipitation(elapsed, weather, quality, camera);
  }
  return { update, updateCameraWeather, ocean, dispose() { disposeObject(group); scene.remove(group); scene.fog = null; } };
}
