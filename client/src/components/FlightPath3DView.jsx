// FlightPath3DView.jsx — Enhanced 3D flight-path visualizer.
//
// Improvements over v1:
//  • Altitude-gradient path coloring (blue → cyan → orange) using vertex colors.
//  • Pulsing drone position indicator ring.
//  • Origin marker (green sphere) locked to first GPS fix.
//  • HUD overlay with live lat/lon/MSL/relative-alt readout.
//  • Path stats panel (points, cumulative distance, peak altitude).
//  • Altitude color scale legend.
//  • Camera presets: Chase · Top · Side · Free.
//  • Status badge (GPS TRACKING / AWAITING GPS FIX).
//  • All Three.js resources cleaned up on unmount.

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Convert lat/lon delta to local ENU metres relative to an origin. */
function latLonToMeters(lat, lon, originLat, originLon) {
  const R = 6_378_137;
  const dLat = THREE.MathUtils.degToRad(lat - originLat);
  const dLon = THREE.MathUtils.degToRad(lon - originLon);
  const latRad = THREE.MathUtils.degToRad(originLat);
  return {
    x: dLon * Math.cos(latRad) * R, // East
    y: dLat * R,                     // North
  };
}

/** Maps a normalised altitude ratio [0..1] → THREE.Color (blue → cyan → orange). */
function altitudeToColor(t) {
  const clamped = Math.max(0, Math.min(1, t));
  const r = Math.min(1, clamped * 2.2);
  const g = clamped < 0.5 ? clamped * 2 : (1 - clamped) * 2;
  const b = Math.max(0, 1 - clamped * 2.5);
  return new THREE.Color(r, g, b);
}

// ─── component ──────────────────────────────────────────────────────────────

const FlightPath3DView = ({ latitude, longitude, altitude, relativeAltitude }) => {
  const mountRef       = useRef(null);
  const controlsRef    = useRef(null);
  const cameraRef      = useRef(null);
  const sceneRef       = useRef(null);
  const droneRef       = useRef(null);
  const droneRingRef   = useRef(null);
  const pathLineRef    = useRef(null);
  const originRef      = useRef(null);   // { lat, lon, alt }
  const pointsRef      = useRef([]);     // Array<{ pos: THREE.Vector3, relAlt: number }>
  const followRef      = useRef(false);
  const ringPhaseRef   = useRef(0);
  const maxRelAltRef   = useRef(0);

  const [followEnabled, setFollowEnabled] = useState(false);
  const [viewAngle, setViewAngle]         = useState('chase');
  const [pathStats, setPathStats]         = useState({ points: 0, distanceM: 0, maxAltM: 0 });

  const hasPosition =
    latitude != null &&
    longitude != null &&
    !Number.isNaN(Number(latitude)) &&
    !Number.isNaN(Number(longitude));

  // ── Scene initialisation (once) ──────────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width  = container.clientWidth  || 400;
    const height = container.clientHeight || 320;

    // Scene
    const scene = new THREE.Scene();
    scene.background = null;
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 10, 25);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    // Orbit controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping  = true;
    controls.dampingFactor  = 0.08;
    controls.maxDistance    = 600;
    controls.minDistance    = 0.5;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.2));
    const dir1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dir1.position.set(4, 8, 4);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x38bdf8, 0.8);
    dir2.position.set(-4, -2, -4);
    scene.add(dir2);

    // Ground grid (larger, subtle)
    const grid = new THREE.GridHelper(400, 80, 0x1e3a5f, 0x0a1628);
    grid.position.y = 0;
    scene.add(grid);

    // Axes helper
    const axes = new THREE.AxesHelper(6);
    axes.renderOrder = 1;
    scene.add(axes);

    // Origin marker — green glowing sphere
    const originMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0x10b981,
        emissive: 0x059669,
        emissiveIntensity: 0.7,
      }),
    );
    originMesh.name = 'origin';
    scene.add(originMesh);

    // Drone marker — amber sphere
    const drone = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfbbf24,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.6,
      }),
    );
    scene.add(drone);
    droneRef.current = drone;

    // Pulsing ring under drone
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.0, 32),
      new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    droneRingRef.current = ring;

    // Path line (vertex-colored)
    const pathLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ vertexColors: true, linewidth: 2 }),
    );
    scene.add(pathLine);
    pathLineRef.current = pathLine;

    // ── Animation loop ───────────────────────────────────────────────────
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);

      // Pulse the ring
      ringPhaseRef.current += 0.045;
      const s = 1 + 0.35 * Math.sin(ringPhaseRef.current);
      if (droneRingRef.current) {
        droneRingRef.current.scale.set(s, s, s);
        droneRingRef.current.material.opacity =
          0.35 + 0.35 * Math.sin(ringPhaseRef.current);
      }

      // Smooth camera follow
      if (followRef.current && droneRef.current) {
        controls.target.lerp(droneRef.current.position, 0.06);
      }

      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    ro.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // ── Telemetry update ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasPosition) return;

    // Lock origin on first valid fix
    if (!originRef.current) {
      originRef.current = { lat: latitude, lon: longitude, alt: altitude ?? 0 };
    }

    const { x, y } = latLonToMeters(
      latitude, longitude,
      originRef.current.lat, originRef.current.lon,
    );

    const relAlt =
      relativeAltitude != null
        ? relativeAltitude
        : altitude != null
          ? altitude - originRef.current.alt
          : 0;

    // Three.js ENU → (East=+X, Up=+Y, North=-Z)
    const newPos = new THREE.Vector3(x, relAlt, -y);

    // Jitter filter — ignore updates < 0.5 m
    const pts     = pointsRef.current;
    const lastPt  = pts[pts.length - 1];
    if (lastPt && newPos.distanceTo(lastPt.pos) < 0.5) return;

    pts.push({ pos: newPos.clone(), relAlt });
    if (pts.length > 5000) pts.shift();

    if (relAlt > maxRelAltRef.current) maxRelAltRef.current = relAlt;

    // Rebuild altitude-colored path geometry
    if (pathLineRef.current && pts.length >= 2) {
      const n         = pts.length;
      const positions = new Float32Array(n * 3);
      const colors    = new Float32Array(n * 3);
      const maxAlt    = Math.max(maxRelAltRef.current, 1);

      for (let i = 0; i < n; i++) {
        const { pos, relAlt: ra } = pts[i];
        positions[i * 3]     = pos.x;
        positions[i * 3 + 1] = pos.y;
        positions[i * 3 + 2] = pos.z;

        const c = altitudeToColor(ra / maxAlt);
        colors[i * 3]     = c.r;
        colors[i * 3 + 1] = c.g;
        colors[i * 3 + 2] = c.b;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geom.setAttribute('color',    new THREE.BufferAttribute(colors,    3));
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.geometry = geom;
    }

    // Move drone + ring
    if (droneRef.current)    droneRef.current.position.copy(newPos);
    if (droneRingRef.current) {
      droneRingRef.current.position.set(newPos.x, 0, newPos.z);
    }

    // Compute cumulative path distance
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += pts[i].pos.distanceTo(pts[i - 1].pos);
    }

    setPathStats({ points: pts.length, distanceM: dist, maxAltM: maxRelAltRef.current });
  }, [latitude, longitude, altitude, relativeAltitude, hasPosition]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleClearPath = () => {
    pointsRef.current  = [];
    maxRelAltRef.current = 0;
    originRef.current  = null;

    if (pathLineRef.current) {
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.geometry = new THREE.BufferGeometry();
    }
    if (droneRef.current)      droneRef.current.position.set(0, 0, 0);
    if (droneRingRef.current)  droneRingRef.current.position.set(0, 0, 0);

    setPathStats({ points: 0, distanceM: 0, maxAltM: 0 });
  };

  const resetCamera = (type = 'chase') => {
    if (!cameraRef.current || !controlsRef.current) return;
    setViewAngle(type);
    const cam    = cameraRef.current;
    const ctl    = controlsRef.current;
    const target = droneRef.current?.position.clone() ?? new THREE.Vector3(0, 0, 0);

    if (type === 'free') {
      cam.position.set(0, 10, 25);
      ctl.target.set(0, 0, 0);
    } else {
      const offsets = {
        chase: new THREE.Vector3(0,  10,  25),
        top:   new THREE.Vector3(0,  60, 0.001),
        side:  new THREE.Vector3(40, 6,   0),
      };
      cam.position.copy(target).add(offsets[type] ?? offsets.chase);
      ctl.target.copy(target);
    }
    ctl.update();
  };

  const toggleFollow = () => {
    const next = !followRef.current;
    followRef.current = next;
    setFollowEnabled(next);
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="flightpath-3d-card" aria-label="3D Flight Path Viewer">

      {/* ── Header ── */}
      <div className="flightpath-3d-header">
        <div className="flightpath-title-group">
          <div className="flightpath-heading-row">
            <h3>3D Flight Path</h3>
            <span className={`fp-status-badge ${hasPosition ? 'fp-status-tracking' : 'fp-status-waiting'}`}>
              <span className="fp-status-dot" />
              {hasPosition ? 'GPS TRACKING' : 'AWAITING GPS FIX'}
            </span>
          </div>
          <span className="flightpath-subtitle">
            Local ENU frame · Origin locked on first GPS fix · Altitude-gradient path coloring
          </span>
        </div>

        <div className="flightpath-controls-toolbar">
          <button
            type="button"
            className={`btn-view ${followEnabled ? 'active' : ''}`}
            onClick={toggleFollow}
            title="Auto-follow drone position"
          >
            {followEnabled ? 'Follow: ON' : 'Follow: OFF'}
          </button>

          <div className="view-presets-group">
            {['chase', 'top', 'side', 'free'].map((v) => (
              <button
                key={v}
                type="button"
                className={`btn-preset ${viewAngle === v ? 'active' : ''}`}
                onClick={() => resetCamera(v)}
                title={`Switch to ${v} view`}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn-view btn-danger-soft"
            onClick={handleClearPath}
            title="Clear recorded flight path"
          >
            Clear Path
          </button>
        </div>
      </div>

      {/* ── Viewport ── */}
      <div className="flightpath-viewport-container">
        <div ref={mountRef} className="flightpath-canvas-wrapper" />

        {/* HUD Overlay */}
        <div className="fp-hud-overlay">
          <div className="hud-metric">
            <span className="hud-label">LAT:</span>
            <span className="hud-value">
              {hasPosition ? `${Number(latitude).toFixed(5)}°` : '--'}
            </span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">LON:</span>
            <span className="hud-value">
              {hasPosition ? `${Number(longitude).toFixed(5)}°` : '--'}
            </span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">ALT MSL:</span>
            <span className="hud-value">
              {altitude != null ? `${Number(altitude).toFixed(1)} m` : '--'}
            </span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">REL ALT:</span>
            <span className="hud-value">
              {relativeAltitude != null ? `${Number(relativeAltitude).toFixed(1)} m` : '--'}
            </span>
          </div>
        </div>

        {/* Path Stats Panel */}
        <div className="fp-stats-overlay">
          <div className="fp-stat">
            <span className="fp-stat-label">Pts</span>
            <span className="fp-stat-value">{pathStats.points}</span>
          </div>
          <div className="fp-stat">
            <span className="fp-stat-label">Dist</span>
            <span className="fp-stat-value">
              {pathStats.distanceM >= 1000
                ? `${(pathStats.distanceM / 1000).toFixed(2)} km`
                : `${pathStats.distanceM.toFixed(1)} m`}
            </span>
          </div>
          <div className="fp-stat">
            <span className="fp-stat-label">Peak</span>
            <span className="fp-stat-value">{pathStats.maxAltM.toFixed(1)} m</span>
          </div>
        </div>

        {/* Altitude Color Legend */}
        <div className="fp-altitude-legend">
          <div className="fp-alt-legend-bar" />
          <div className="fp-alt-legend-labels">
            <span>High</span>
            <span>Mid</span>
            <span>Low</span>
          </div>
        </div>

        {/* No GPS Banner */}
        {!hasPosition && (
          <div className="attitude-unavailable-banner">
            <div className="unavailable-icon">📡</div>
            <div className="unavailable-text">
              <strong>No GPS Fix</strong>
              <p>Path tracking begins on the first valid GLOBAL_POSITION_INT packet.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FlightPath3DView;
