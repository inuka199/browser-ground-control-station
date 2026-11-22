import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';
import { createLiveRouteTracker, LIVE_ROUTE_MAX_POINTS } from '../../services/liveRoute.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import './EnvironmentView.css';
import { flightMetrics, validatePath } from '../../services/flightRecords.js';

const WAYPOINTS = [[0, 3, 90], [0, 45, 45], [-80, 65, -25], [-40, 85, -120], [95, 60, -90], [110, 35, 45], [0, 3, 90]];
const ROUTE = new THREE.CatmullRomCurve3(WAYPOINTS.map(p => new THREE.Vector3(...p)), false, 'centripetal');
const LENGTH = ROUTE.getLength();

export function RouteScene({ playing, progress, speed, view, grid, onProgress, onError, flownPath, liveTelemetry }) {
  const mount = useRef(null);
  const options = useRef({ playing, progress, speed, view, grid, onProgress, liveTelemetry });
  useEffect(() => { options.current = { playing, progress, speed, view, grid, onProgress, liveTelemetry }; }, [playing, progress, speed, view, grid, onProgress, liveTelemetry]);
  useEffect(() => {
    const recorded = flownPath.length > 1;
    const duration = recorded ? Math.max(1, (flownPath.at(-1).t - flownPath[0].t) / 1000) : 70;
    const points = recorded ? flownPath.map(p => new THREE.Vector3(p.x, p.y, p.z)) : ROUTE.getSpacedPoints(500);
    const bounds = new THREE.Box3().setFromPoints(points);
    const center = bounds.getCenter(new THREE.Vector3());
    const fit = Math.max(100, bounds.getSize(new THREE.Vector3()).length() * 1.3);
    const indexAt = (fraction) => {
      if (!recorded) return Math.min((points.length - 1) * fraction, points.length - 1);
      const time = flownPath[0].t + fraction * duration * 1000;
      let low = 0, high = flownPath.length - 1;
      while (low < high) {
        const mid = Math.ceil((low + high) / 2);
        if (flownPath[mid].t <= time) low = mid;
        else high = mid - 1;
      }
      const next = Math.min(low + 1, flownPath.length - 1);
      const span = flownPath[next].t - flownPath[low].t;
      return low + (span > 0 ? Math.max(0, Math.min(1, (time - flownPath[low].t) / span)) : 0);
    };
    const pointAt = (fraction) => {
      const index = indexAt(fraction);
      const before = Math.floor(index);
      return points[before].clone().lerp(points[Math.min(before + 1, points.length - 1)], index - before);
    };
    const host = mount.current;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { onError('Your browser could not start 3D rendering. Enable WebGL and reload.'); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x09151e);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const replay = new THREE.Group(); scene.add(replay);
    scene.fog = new THREE.Fog(0x09151e, 450, 1100);
    const camera = new THREE.PerspectiveCamera(48, 1, 0.5, Math.max(1500, fit * 8));
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    controls.minDistance = 15;
    controls.maxDistance = Math.max(800, fit * 4);
    scene.add(new THREE.HemisphereLight(0xbceaff, 0x19332a, 2.4));
    const sun = new THREE.DirectionalLight(0xffe9bf, 3);
    sun.position.set(100, 200, 80); scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600), new THREE.MeshStandardMaterial({ color: 0x142b2a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.2; scene.add(ground);
    const groundGrid = new THREE.GridHelper(1000, 50, 0x49726b, 0x24443e); scene.add(groundGrid);
    // Fixed scenery stays in the same metre-based coordinate frame as the route.
    for (let i = 0; i < 65; i++) {
      const angle = i * 2.39996;
      const radius = 205 + (i % 9) * 24;
      const height = 12 + (i * 17 % 65);
      const building = new THREE.Mesh(new THREE.BoxGeometry(14 + i % 12, height, 18), new THREE.MeshStandardMaterial({ color: i % 3 ? 0x263c46 : 0x375361, roughness: 0.7 }));
      building.position.set(Math.cos(angle) * radius, height / 2, Math.sin(angle) * radius);
      scene.add(building);
    }
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 0.5, 48), new THREE.MeshStandardMaterial({ color: 0x42776a }));
    pad.position.set(0, 0.2, recorded ? 0 : 90); replay.add(pad);
    const padRing = new THREE.Mesh(new THREE.RingGeometry(10, 10.7, 48), new THREE.MeshBasicMaterial({ color: 0xa2f9d4, side: THREE.DoubleSide }));
    padRing.rotation.x = -Math.PI / 2; padRing.position.set(0, 0.5, recorded ? 0 : 90); replay.add(padRing);
    const route = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0x65f5d0 })); replay.add(route);
    const shadow = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(p.x, 0.15, p.z))), new THREE.LineDashedMaterial({ color: 0x457f72, dashSize: 3, gapSize: 3 }));
    shadow.computeLineDistances(); replay.add(shadow);
    (recorded ? [] : WAYPOINTS.slice(0, -1)).forEach((p, i) => {
      const pos = new THREE.Vector3(...p);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(2, 16, 16), new THREE.MeshBasicMaterial({ color: i ? 0xffcf81 : 0x65f5d0 }));
      marker.position.copy(pos); replay.add(marker);
      replay.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([pos, new THREE.Vector3(p[0], 0, p[2])]), new THREE.LineBasicMaterial({ color: 0x6c8d83, transparent: true, opacity: 0.5 })));
      const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 64;
      const ctx = canvas.getContext('2d'); ctx.fillStyle = '#10252e'; ctx.fillRect(0, 0, 128, 64); ctx.fillStyle = '#e2fff6'; ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(i ? `0${i}` : 'HOME', 64, 43);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
      label.position.copy(pos).add(new THREE.Vector3(0, 9, 0)); label.scale.set(12, 6, 1); replay.add(label);
    });
    const drone = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(3, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0xf1f6fa })); drone.add(body);
    for (const x of [-2.7, 2.7]) for (const z of [-2.7, 2.7]) {
      const rotor = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.15, 20), new THREE.MeshStandardMaterial({ color: 0xffb85e, transparent: true, opacity: 0.8 })); rotor.position.set(x, 0.6, z); drone.add(rotor);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 7.6), body.material); arm.rotation.y = x * z > 0 ? Math.PI / 4 : -Math.PI / 4; drone.add(arm);
    }
    scene.add(drone);
    const completed = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xffffff })); replay.add(completed);
    const liveTracker = createLiveRouteTracker();
    const liveGeometry = new THREE.BufferGeometry();
    const liveAttribute = new THREE.BufferAttribute(new Float32Array(LIVE_ROUTE_MAX_POINTS * 3), 3);
    liveAttribute.setUsage(THREE.DynamicDrawUsage);
    liveGeometry.setAttribute('position', liveAttribute);
    liveGeometry.setDrawRange(0, 0);
    const liveTrail = new THREE.Line(liveGeometry, new THREE.LineBasicMaterial({ color: 0x65f5d0 }));
    liveTrail.frustumCulled = false; scene.add(liveTrail);
    let lastRevision = -1;
    let frame, last = performance.now(), elapsed = 0, lastView;
    const resize = new ResizeObserver(() => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }); resize.observe(host);
    function animate(now) {
      frame = requestAnimationFrame(animate);
      const o = options.current;
      const live = liveTracker.update(o.liveTelemetry);
      const dt = Math.min((now - last) / 1000, 0.1); last = now;
      if (!live && o.playing) { o.progress = Math.min(1, o.progress + dt * o.speed / duration); elapsed += dt; if (elapsed > 0.08 || o.progress === 1) { o.onProgress(o.progress); elapsed = 0; } }
      const p = live ? new THREE.Vector3(live.position.x, live.position.y, live.position.z) : pointAt(o.progress);
      const previous = live?.points.at(-2);
      const tangent = live ? (previous ? p.clone().sub(new THREE.Vector3(previous.x, previous.y, previous.z)).normalize() : new THREE.Vector3(0, 0, -1)) : pointAt(Math.min(1, o.progress + 0.002)).sub(pointAt(Math.max(0, o.progress - 0.002))).normalize();
      drone.position.copy(p); drone.rotation.y = Math.atan2(tangent.x, tangent.z);
      replay.visible = !live; liveTrail.visible = !!live;
      if (live && live.revision !== lastRevision) {
        live.points.forEach((point, i) => liveAttribute.setXYZ(i, point.x, point.y, point.z));
        liveAttribute.needsUpdate = true;
        liveGeometry.setDrawRange(0, live.points.length);
        lastRevision = live.revision;
      }
      completed.geometry.setDrawRange(0, Math.max(0, Math.floor(indexAt(o.progress)) + 1));
      groundGrid.visible = o.grid;
      const currentView = `${live ? 'live' : 'replay'}:${o.view}`;
      if (lastView !== currentView) {
        camera.position.copy(center).add(o.view === 'top' ? new THREE.Vector3(0, fit, 0.1) : new THREE.Vector3(fit * 0.65, fit * 0.55, fit * 0.75));
        if (live) camera.position.copy(p).add(new THREE.Vector3(70, 70, 70));
        controls.target.copy(live ? p : center); lastView = currentView;
      }
      if (live || o.view === 'follow') {
        const offset = o.view === 'top' ? new THREE.Vector3(0, 120, 0.1) : o.view === 'follow' ? new THREE.Vector3(-tangent.x * 45, 24, -tangent.z * 45) : new THREE.Vector3(70, 70, 70);
        camera.position.lerp(p.clone().add(offset), 0.05); controls.target.copy(p);
      }
      controls.update(); renderer.render(scene, camera);
    }
    frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); resize.disconnect(); controls.dispose(); scene.traverse(obj => { obj.geometry?.dispose(); const mats = Array.isArray(obj.material) ? obj.material : [obj.material]; mats.forEach(m => { m?.map?.dispose(); m?.dispose(); }); }); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); };
  }, [onError, flownPath]);
  return <div ref={mount} className="env-canvas" aria-label="Interactive 3D flight route. Drag to orbit, scroll to zoom." />;
}

export default function EnvironmentView() {
  const [mode, setMode] = useState('preview');
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [view, setView] = useState('orbit');
  const [grid, setGrid] = useState(true);
  const [error, setError] = useState('');
  const { positionData, positionFresh } = useTelemetryHealth();
  const storedPath = useSimulatorStore(s => s.flownPath);
  const routeLabel = useSimulatorStore(s => s.routeLabel);
  const clearFlownPath = useSimulatorStore(s => s.clearFlownPath);
  const flownPath = useMemo(() => {
    try { return validatePath(storedPath); } catch { return []; }
  }, [storedPath]);
  const hasRoute = flownPath.length > 1;
  const live = mode === 'auto' && positionFresh;
  const metrics = flightMetrics(flownPath, progress);
  const routeLength = hasRoute ? metrics.distance : LENGTH;
  const pos = hasRoute ? metrics.position : ROUTE.getPointAt(progress);
  const label = hasRoute && typeof routeLabel === 'string' ? routeLabel : 'Coastal circuit';

  return <section className="environment-page" aria-label="Route Replay">
    <header className="env-heading">
      <div><span className="env-eyebrow">REPLAY · READ ONLY</span><h1>Route Replay</h1><p>Replay a recorded flight or follow your drone.</p></div>
      <div className="env-modes">
        <button className={mode === 'preview' ? 'selected' : ''} aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Recorded flight</button>
        <button className={mode === 'auto' ? 'selected' : ''} aria-pressed={mode === 'auto'} onClick={() => setMode('auto')}>Follow live drone</button>
      </div>
    </header>
    <div className="env-layout"><div className="env-stage">
      <div className="env-stage-top">
        <span><i /> {live ? 'LIVE ROUTE' : hasRoute ? label.toUpperCase() : 'DEMO ROUTE'}</span>
        <div>{['orbit', 'top', 'follow'].map(v => <button key={v} className={view === v ? 'selected' : ''} onClick={() => setView(v)}>{v === 'orbit' ? 'Overview' : v === 'top' ? 'Top down' : 'Follow'}</button>)}</div>
      </div>
      <RouteScene playing={playing} progress={progress} speed={speed} view={view} grid={grid} flownPath={flownPath} liveTelemetry={live ? positionData : null} onProgress={p => { setProgress(p); if (p === 1) setPlaying(false); }} onError={setError} />
      {error && <div className="env-error" role="alert">{error}</div>}
      <div className="env-compass">N ↑<span>20 m grid</span></div>
      <div className="env-legend"><span>● {live ? 'Drone position · local coordinates' : hasRoute ? 'Saved pathway' : 'Sample pathway'}</span><span>— {live ? 'Live trail' : 'Flown route'}</span></div>
      {!live && <div className="env-playback">
        <button className="env-play" onClick={() => { if (progress === 1) setProgress(0); setPlaying(!playing); }}>{playing ? 'Pause' : progress === 1 ? 'Replay' : 'Play route'}</button>
        <input aria-label="Flight progress" type="range" min="0" max="1" step="0.001" value={progress} onChange={e => setProgress(Number(e.target.value))} />
        <span>{Math.round(progress * 100)}%</span>
        <select aria-label="Playback speed" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[0.5, 1, 2, 4].map(s => <option key={s} value={s}>{s}×</option>)}</select>
        <button onClick={() => { setProgress(0); setPlaying(false); }}>Reset</button>
      </div>}
    </div>
    <aside className="env-panel">
      <span className="env-eyebrow">{live ? 'LIVE ROUTE' : hasRoute ? 'SAVED ROUTE' : 'FLIGHT PLAN / 01'}</span>
      <h2>{live ? 'Drone route' : label}</h2>
      <p>{live ? 'Position relative to the first live fix. Replay resumes when a valid live position is unavailable.' : hasRoute ? 'Route positions in order, with playback timed to their timestamps.' : 'A sample inspection route with a climb, five waypoints, and a return to home.'}</p>
      {!live && <>
        <div className="env-metrics">
          <div><span>Route length</span><strong>{Math.round(routeLength)} <small>m</small></strong></div>
          <div><span>Current altitude</span><strong>{pos.y.toFixed(1)} <small>m</small></strong></div>
          <div><span>Distance flown</span><strong>{Math.round(hasRoute ? metrics.travelled : routeLength * progress)} <small>m</small></strong></div>
          <div><span>Peak altitude</span><strong>{Math.round(hasRoute ? metrics.peak : Math.max(...ROUTE.getPoints(500).map(p => p.y)))} <small>m</small></strong></div>
        </div>
        <h3>{hasRoute ? 'Route samples' : 'Waypoints'}</h3>
        <ol className="env-waypoints">{(hasRoute ? [] : WAYPOINTS.slice(0, -1)).map((p, i) => <li key={i}><span>{i ? `0${i}` : 'H'}</span><div>{i ? `Waypoint ${i}` : 'Home / landing pad'}<small>{p[1]} m altitude</small></div></li>)}</ol>
        {hasRoute && <button onClick={() => { clearFlownPath(); setProgress(0); setPlaying(false); }}>Clear preview</button>}
      </>}
      <label className="env-grid"><input type="checkbox" checked={grid} onChange={e => setGrid(e.target.checked)} /> Show ground grid</label>
      <p className="env-help">Drag to orbit · Scroll to zoom<br />All distances in metres. Scenery is illustrative. This view does not send vehicle commands.</p>
    </aside>
    </div>
  </section>;
}
