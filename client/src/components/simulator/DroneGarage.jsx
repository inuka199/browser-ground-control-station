/**
 * simulator/DroneGarage.jsx
 *
 * Full-screen drone model selection screen shown before entering flight.
 * Features:
 *  - Live 3D rotating preview of each model (own mini Three.js canvas)
 *  - Model name, tagline, description, and specs
 *  - Selection persists in useSimulatorStore
 *  - "Fly Now" launches the simulator
 */
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { DRONE_MODELS, getModelById } from './models/droneModels.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import './DroneGarage.css';

// ── Mini 3D preview canvas for a single model ─────────────────────────────────

function ModelPreview({ modelDef }) {
  const mountRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;
    const w = container.clientWidth || 280;
    const h = container.clientHeight || 220;

    const scene = new THREE.Scene();
    scene.background = null;

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
    camera.position.set(2.8, 2.1, 3.2);

    let renderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); }
    catch {
      // Surface an external WebGL initialization failure in the preview.
      // eslint-disable-next-line react/set-state-in-effect
      setError('3D preview is unavailable. Enable hardware acceleration and reload. You can still select an aircraft.');
      return;
    }
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);
    const onContextLost = event => { event.preventDefault(); setError('The graphics connection was lost. Reload to restore the preview.'); };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    const controls = new OrbitControls(camera,renderer.domElement);
    controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 2; controls.maxDistance = 8;
    controls.autoRotate = true; controls.autoRotateSpeed = 1;
    const pmrem = new THREE.PMREMGenerator(renderer), studio = new RoomEnvironment();
    const reflection = pmrem.fromScene(studio,0.04); scene.environment = reflection.texture;
    studio.dispose(); pmrem.dispose();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 1.5));
    const d1 = new THREE.DirectionalLight(0xffffff, 2.5);
    d1.position.set(5, 8, 5);
    scene.add(d1);
    const d2 = new THREE.DirectionalLight(new THREE.Color(modelDef.accentColor), 1.5);
    d2.position.set(-3, 2, -4);
    scene.add(d2);

    // Subtle accent rim
    const rimLight = new THREE.PointLight(new THREE.Color(modelDef.accentColor), 2, 10);
    rimLight.position.set(0, -1, -4);
    scene.add(rimLight);

    // Build model
    const { group, dispose } = modelDef.build();
    scene.add(group);

    // Ground reflection disc
    const discGeo = new THREE.CircleGeometry(2.5, 32);
    const discMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(modelDef.accentColor),
      transparent: true,
      opacity: 0.06,
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = -0.55;
    scene.add(disc);

    let animId;
    let t = 0, last = performance.now();
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const now = performance.now(), dt = Math.min((now-last)/1000,0.05); last=now; t+=dt;
      if(document.hidden) return;
      group.position.y = Math.sin(t * 0.8) * 0.08;
      controls.update(dt);
      renderer.render(scene, camera);
    };
    animate();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width: nw, height: nh } = e.contentRect;
        if (nw > 0 && nh > 0) {
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          // CSS owns the viewport. Canvas backing dimensions must not resize it.
          renderer.setSize(nw, nh, false);
        }
      }
    });
    ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.parentNode?.removeChild(renderer.domElement);
      discGeo.dispose(); discMat.dispose();
      dispose(); controls.dispose(); reflection.dispose();
    };
  }, [modelDef]);

  return <div ref={mountRef} className="garage-preview-canvas" aria-label={`${modelDef.name} interactive 3D preview`}>{error && <p className="garage-preview-error" role="alert">{error}</p>}</div>;
}

// ── Spec row ──────────────────────────────────────────────────────────────────

function SpecRow({ label, value }) {
  return (
    <div className="garage-spec-row">
      <span className="garage-spec-label">{label}</span>
      <span className="garage-spec-value">{value}</span>
    </div>
  );
}

// ── Main Garage ───────────────────────────────────────────────────────────────

export default function DroneGarage() {
  const navigate = useNavigate();
  const storedModelId = useSimulatorStore((s) => s.droneModelId);
  const { setDroneModelId } = useSimulatorStore.getState();

  const selectedId = storedModelId ?? DRONE_MODELS[0].id;
  const selected = getModelById(selectedId);

  const handleSelect = (id) => setDroneModelId(id);
  const handleFly = () => {
    setDroneModelId(selectedId);
    navigate('/simulator');
  };

  return (
    <div className="garage-page">
      {/* Header */}
      <div className="garage-header">
        <button className="garage-back-btn" onClick={() => navigate('/')} aria-label="Back to dashboard">
          ← Dashboard
        </button>
        <div className="garage-title-block">
          <span className="garage-icon">🚁</span>
          <h1 className="garage-title">Drone Garage</h1>
          <p className="garage-subtitle">Select your aircraft for this flight</p>
        </div>
      </div>

      <div className="garage-body">
        {/* Left: model selector cards */}
        <div className="garage-card-list">
          {DRONE_MODELS.map((m) => (
            <button
              key={m.id}
              id={`garage-card-${m.id}`}
              className={`garage-card ${selectedId === m.id ? 'garage-card--selected' : ''}`}
              style={{ '--accent': m.accentColor }}
              onClick={() => handleSelect(m.id)}
              aria-pressed={selectedId === m.id}
            >
              <span className="garage-card-name">{m.name}</span>
              <span className="garage-card-tagline">{m.tagline}</span>
              <div className="garage-card-motors">{m.specs.motors} motors</div>
              {selectedId === m.id && <div className="garage-card-check">✓</div>}
            </button>
          ))}
        </div>

        {/* Centre: 3D preview */}
        <div className="garage-preview-area">
          <ModelPreview key={selected.id} modelDef={selected} />
          <div className="garage-preview-label" style={{ color: selected.accentColor }}>
            {selected.name}
          </div>
          <p className="garage-preview-hint">Drag to orbit · Scroll to zoom</p>
        </div>

        {/* Right: details */}
        <div className="garage-detail-panel">
          <div className="garage-detail-name" style={{ color: selected.accentColor }}>
            {selected.name}
          </div>
          <div className="garage-detail-tagline">{selected.tagline}</div>
          <p className="garage-detail-desc">{selected.description}</p>

          <div className="garage-specs">
            <div className="garage-specs-title">Specifications</div>
            <SpecRow label="Motors"     value={`${selected.specs.motors}x`} />
            <SpecRow label="Max Alt"    value={selected.specs.maxAlt} />
            <SpecRow label="Endurance"  value={selected.specs.endurance} />
            <SpecRow label="Max Payload" value={selected.specs.payload} />
          </div>

          <button
            id="garage-fly-btn"
            className="garage-fly-btn"
            style={{ '--accent': selected.accentColor }}
            onClick={handleFly}
          >
            ▶ Fly with {selected.name}
          </button>
          <button
            className="garage-sim-direct-btn"
            onClick={() => navigate('/simulator')}
          >
            Enter simulator with current aircraft
          </button>
        </div>
      </div>
    </div>
  );
}
