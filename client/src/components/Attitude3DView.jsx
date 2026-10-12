import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Creates a text sprite using an HTML5 2D canvas.
 * Avoids extra font loaders or external assets.
 */
function createTextSprite(text, color = '#ffffff', fontSize = 28, bgColor = 'rgba(15, 23, 42, 0.75)') {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = bgColor;
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(4, 8, 120, 48, 8);
  } else {
    ctx.rect(4, 8, 120, 48);
  }
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.fillText(text, 64, 32);

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.9, 0.45, 1);
  return sprite;
}

/**
 * Builds a procedural, lightweight 3D quadcopter model.
 * 
 * Orientation convention:
 * - Forward (Nose): -Z
 * - Rear (Tail): +Z
 * - Right (Starboard): +X
 * - Left (Port): -X
 * - Up: +Y
 */
function buildQuadcopterModel() {
  const drone = new THREE.Group();

  // Materials
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.8,
    roughness: 0.3,
  });

  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9, // Bright Sky Blue
    metalness: 0.5,
    roughness: 0.2,
  });

  const frontArmMaterial = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.7,
    roughness: 0.4,
  });

  const rearArmMaterial = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.7,
    roughness: 0.4,
  });

  const frontRotorMaterial = new THREE.MeshStandardMaterial({
    color: 0xef4444, // Bright Red (Front distinction)
    metalness: 0.3,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });

  const rearRotorMaterial = new THREE.MeshStandardMaterial({
    color: 0x3b82f6, // Bright Blue (Rear distinction)
    metalness: 0.3,
    roughness: 0.3,
    transparent: true,
    opacity: 0.85,
  });

  const portLedMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 }); // Left (Port) Red
  const stbdLedMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 }); // Right (Starboard) Green
  const noseLedMaterial = new THREE.MeshBasicMaterial({ color: 0xf97316 }); // Front Orange

  // 1. Central Body Hull
  const bodyGeo = new THREE.CylinderGeometry(0.55, 0.65, 0.22, 8);
  const body = new THREE.Mesh(bodyGeo, bodyMaterial);
  body.castShadow = true;
  drone.add(body);

  // Top Dome / Flight Controller Cover
  const domeGeo = new THREE.SphereGeometry(0.35, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const dome = new THREE.Mesh(domeGeo, accentMaterial);
  dome.position.y = 0.11;
  drone.add(dome);

  // Forward Direction Arrow Indicator (pointing along -Z)
  const arrowGeo = new THREE.ConeGeometry(0.18, 0.45, 4);
  const arrow = new THREE.Mesh(arrowGeo, noseLedMaterial);
  arrow.rotation.x = -Math.PI / 2; // point along -Z
  arrow.position.set(0, 0.12, -0.65);
  drone.add(arrow);

  // 2. Arms (X-configuration)
  const armRadius = 0.045;
  const armLength = 1.35;
  const motorOffset = 0.95;

  const armGeo = new THREE.CylinderGeometry(armRadius, armRadius, armLength * 2, 12);

  // Diagonal Arm 1: Front-Left (-X, -Z) to Rear-Right (+X, +Z)
  const arm1 = new THREE.Mesh(armGeo, frontArmMaterial);
  arm1.rotation.y = Math.PI / 4;
  arm1.rotation.z = Math.PI / 2;
  drone.add(arm1);

  // Diagonal Arm 2: Front-Right (+X, -Z) to Rear-Left (-X, +Z)
  const arm2 = new THREE.Mesh(armGeo, rearArmMaterial);
  arm2.rotation.y = -Math.PI / 4;
  arm2.rotation.z = Math.PI / 2;
  drone.add(arm2);

  // 3. Motors & Propellers at the 4 corners
  const motorGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.16, 16);
  const propDiscGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.02, 24);
  const propBladeGeo = new THREE.BoxGeometry(0.82, 0.02, 0.08);

  const motorPositions = [
    { name: 'FL', x: -motorOffset, z: -motorOffset, isFront: true, isPort: true },
    { name: 'FR', x: motorOffset, z: -motorOffset, isFront: true, isPort: false },
    { name: 'RL', x: -motorOffset, z: motorOffset, isFront: false, isPort: true },
    { name: 'RR', x: motorOffset, z: motorOffset, isFront: false, isPort: false },
  ];

  const rotorMeshes = [];

  motorPositions.forEach((pos) => {
    // Motor mount
    const motor = new THREE.Mesh(motorGeo, bodyMaterial);
    motor.position.set(pos.x, 0.08, pos.z);
    drone.add(motor);

    // Propeller Disc / Blades
    const rotorGroup = new THREE.Group();
    rotorGroup.position.set(pos.x, 0.18, pos.z);

    const rMat = pos.isFront ? frontRotorMaterial : rearRotorMaterial;
    const propDisc = new THREE.Mesh(propDiscGeo, rMat);
    rotorGroup.add(propDisc);

    const blade = new THREE.Mesh(propBladeGeo, rMat);
    rotorGroup.add(blade);

    drone.add(rotorGroup);
    rotorMeshes.push(rotorGroup);

    // Navigation LED lights
    const ledGeo = new THREE.SphereGeometry(0.05, 8, 8);
    const ledMat = pos.isPort ? portLedMaterial : stbdLedMaterial;
    const led = new THREE.Mesh(ledGeo, ledMat);
    led.position.set(pos.x * 1.08, 0.02, pos.z * 1.08);
    drone.add(led);
  });

  // Small landing gear legs
  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
  motorPositions.forEach((pos) => {
    const leg = new THREE.Mesh(legGeo, legMat);
    leg.position.set(pos.x * 0.75, -0.16, pos.z * 0.75);
    drone.add(leg);
  });

  return { drone, rotorMeshes };
}

/**
 * Builds reference ground grid, compass cardinal markers, and horizon ring.
 */
function buildReferenceEnvironment() {
  const envGroup = new THREE.Group();

  // Subtle Ground Grid at Y = -1.5
  const gridHelper = new THREE.GridHelper(10, 20, 0x3b82f6, 0x1e293b);
  gridHelper.position.y = -1.5;
  envGroup.add(gridHelper);

  // Outer Cardinal Horizon Ring
  const ringGeo = new THREE.RingGeometry(2.4, 2.45, 64);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.35,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = -1.48;
  envGroup.add(ring);

  // Cardinal direction labels (North = -Z, South = +Z, East = +X, West = -X)
  const northSprite = createTextSprite('N (0°)', '#f87171', 28, 'rgba(239, 68, 68, 0.25)');
  northSprite.position.set(0, -1.4, -2.8);
  envGroup.add(northSprite);

  const southSprite = createTextSprite('S (180°)', '#94a3b8', 26);
  southSprite.position.set(0, -1.4, 2.8);
  envGroup.add(southSprite);

  const eastSprite = createTextSprite('E (90°)', '#38bdf8', 26);
  eastSprite.position.set(2.8, -1.4, 0);
  envGroup.add(eastSprite);

  const westSprite = createTextSprite('W (270°)', '#94a3b8', 26);
  westSprite.position.set(-2.8, -1.4, 0);
  envGroup.add(westSprite);

  return envGroup;
}

const Attitude3DView = ({ roll, pitch, yaw }) => {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const droneGroupRef = useRef(null);
  const rotorMeshesRef = useRef([]);

  // Live state tracking for smooth quaternion slerp / lerp
  const latestAttitudeRef = useRef({
    roll: 0,
    pitch: 0,
    yaw: 0,
    hasData: false,
  });

  const [liveYawEnabled, setLiveYawEnabled] = useState(true);
  const [viewAngle, setViewAngle] = useState('chase'); // 'chase' | 'top' | 'front' | 'side'

  const hasAttitudeData =
    roll !== null &&
    pitch !== null &&
    yaw !== null &&
    !Number.isNaN(Number(roll)) &&
    !Number.isNaN(Number(pitch)) &&
    !Number.isNaN(Number(yaw));

  // Update latest attitude in ref to avoid React re-renders driving the 3D frame loop
  useEffect(() => {
    if (hasAttitudeData) {
      latestAttitudeRef.current = {
        roll: Number(roll),
        pitch: Number(pitch),
        yaw: Number(yaw),
        hasData: true,
      };
    } else {
      latestAttitudeRef.current.hasData = false;
    }
  }, [roll, pitch, yaw, hasAttitudeData]);

  // Main Three.js Scene Setup & Animation Loop
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = null; // transparent to inherit card glassmorphism

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 2.8, 4.4); // Standard rear-quarter chase perspective looking forward (-Z)
    cameraRef.current = camera;

    // 3. Renderer
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

    // 4. OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 12;
    controls.minDistance = 1.5;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dirLight1.position.set(4, 8, 4);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 1.0);
    dirLight2.position.set(-4, -2, -4);
    scene.add(dirLight2);

    // 6. Drone Model
    const { drone, rotorMeshes } = buildQuadcopterModel();
    droneGroupRef.current = drone;
    rotorMeshesRef.current = rotorMeshes;
    scene.add(drone);

    // 7. Environment & Reference Grid
    const env = buildReferenceEnvironment();
    scene.add(env);

    // Subtle axes helper centered at origin (X: Red, Y: Green, Z: Blue)
    const axesHelper = new THREE.AxesHelper(0.8);
    axesHelper.position.set(0, 0.01, 0);
    axesHelper.renderOrder = 1;
    scene.add(axesHelper);

    // 8. Animation & Render Loop
    let animationFrameId;
    const targetQuaternion = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      // Spin rotors slightly for a dynamic live feel
      rotorMeshes.forEach((mesh, idx) => {
        mesh.rotation.y += (idx % 2 === 0 ? 1 : -1) * 0.12;
      });

      // Compute target orientation from latest attitude
      const { roll: rDeg, pitch: pDeg, yaw: yDeg, hasData } = latestAttitudeRef.current;

      if (hasData) {
        // MAVLink Tait-Bryan NED sequence: Yaw (down) -> Pitch (right) -> Roll (forward)
        // Three.js model conventions:
        // - Drone Front = -Z
        // - Drone Right = +X
        // - Drone Up = +Y
        //
        // 1. Yaw: Positive MAVLink yaw is clockwise looking from above.
        //    In Three.js, rotation around +Y by -yaw turns -Z towards +X (clockwise).
        // 2. Pitch: Positive MAVLink pitch is nose up.
        //    In Three.js, rotation around +X by +pitch tilts -Z up (+Y).
        // 3. Roll: Positive MAVLink roll is right wing down.
        //    In Three.js, rotation around +Z by -roll tilts +X down (-Y).
        const rollRad = THREE.MathUtils.degToRad(rDeg);
        const pitchRad = THREE.MathUtils.degToRad(pDeg);
        const yawRad = liveYawEnabled ? THREE.MathUtils.degToRad(yDeg) : 0;

        // Apply Tait-Bryan 'YXZ' rotation order
        euler.set(pitchRad, -yawRad, -rollRad, 'YXZ');
        targetQuaternion.setFromEuler(euler);

        // Smooth spherical interpolation (slerp) to avoid abrupt jumps
        drone.quaternion.slerp(targetQuaternion, 0.18);
      } else {
        // Return smoothly to level pose if telemetry is unavailable
        targetQuaternion.set(0, 0, 0, 1);
        drone.quaternion.slerp(targetQuaternion, 0.05);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // 9. Resize Handling via ResizeObserver
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: newW, height: newH } = entry.contentRect;
        if (newW > 0 && newH > 0) {
          camera.aspect = newW / newH;
          camera.updateProjectionMatrix();
          renderer.setSize(newW, newH);
        }
      }
    });

    resizeObserver.observe(container);

    // 10. Cleanup
    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, [liveYawEnabled]);

  // Camera preset positions
  const resetCameraView = (type = 'chase') => {
    if (!cameraRef.current || !controlsRef.current) return;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    setViewAngle(type);

    switch (type) {
      case 'chase':
        camera.position.set(0, 2.8, 4.4);
        break;
      case 'top':
        camera.position.set(0, 5.5, 0.001);
        break;
      case 'front':
        camera.position.set(0, 1.2, -4.4);
        break;
      case 'side':
        camera.position.set(4.5, 1.2, 0);
        break;
      default:
        camera.position.set(0, 2.8, 4.4);
    }
    controls.target.set(0, 0, 0);
    controls.update();
  };

  return (
    <div className="attitude-3d-card" aria-label="3D Drone Attitude Visualization">
      <div className="attitude-3d-header">
        <div className="attitude-title-group">
          <div className="attitude-heading-row">
            <h3>3D Attitude View</h3>
            <span
              className={`attitude-status-badge ${
                hasAttitudeData ? 'status-live' : 'status-waiting'
              }`}
            >
              <span className="attitude-status-dot" />
              {hasAttitudeData ? 'LIVE ATTITUDE' : 'WAITING FOR ATTITUDE'}
            </span>
          </div>
          <span className="attitude-subtitle">
            MAVLink Real-Time Orientation (Tait-Bryan ZYX · Roll / Pitch / Yaw)
          </span>
        </div>

        {/* View Controls & Angles Readout */}
        <div className="attitude-controls-toolbar">
          <button
            type="button"
            className={`btn-view-toggle ${liveYawEnabled ? 'active' : ''}`}
            onClick={() => setLiveYawEnabled((prev) => !prev)}
            title="Toggle between full 3D Live Yaw and Fixed North Heading"
          >
            {liveYawEnabled ? 'Live Yaw: ON' : 'Live Yaw: OFF'}
          </button>

          <div className="view-presets-group">
            <button
              type="button"
              className={`btn-preset ${viewAngle === 'chase' ? 'active' : ''}`}
              onClick={() => resetCameraView('chase')}
              title="Reset to Chase View (Behind Drone)"
            >
              Chase
            </button>
            <button
              type="button"
              className={`btn-preset ${viewAngle === 'top' ? 'active' : ''}`}
              onClick={() => resetCameraView('top')}
              title="Top View (Plan View)"
            >
              Top
            </button>
            <button
              type="button"
              className={`btn-preset ${viewAngle === 'side' ? 'active' : ''}`}
              onClick={() => resetCameraView('side')}
              title="Side View (Profile)"
            >
              Side
            </button>
          </div>
        </div>
      </div>

      {/* 3D Canvas Viewport */}
      <div className="attitude-viewport-container">
        <div ref={mountRef} className="attitude-canvas-wrapper" />

        {/* Telemetry HUD Overlay */}
        <div className="attitude-hud-overlay">
          <div className="hud-metric">
            <span className="hud-label">ROLL:</span>
            <span className="hud-value">
              {hasAttitudeData ? `${Number(roll).toFixed(1)}°` : '--'}
            </span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">PITCH:</span>
            <span className="hud-value">
              {hasAttitudeData ? `${Number(pitch).toFixed(1)}°` : '--'}
            </span>
          </div>
          <div className="hud-metric">
            <span className="hud-label">YAW:</span>
            <span className="hud-value">
              {hasAttitudeData ? `${Number(yaw).toFixed(1)}°` : '--'}
            </span>
          </div>
        </div>

        {/* Legend / Aircraft Orientation Key */}
        <div className="attitude-legend-overlay">
          <div className="legend-item">
            <span className="legend-dot front-color" />
            <span>Front (Red / Arrow)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot rear-color" />
            <span>Rear (Blue)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot port-color" />
            <span>Left: Port (Red)</span>
          </div>
          <div className="legend-item">
            <span className="legend-dot stbd-color" />
            <span>Right: Starboard (Green)</span>
          </div>
        </div>

        {/* Empty / Disconnected Telemetry Warning Banner */}
        {!hasAttitudeData && (
          <div className="attitude-unavailable-banner">
            <div className="unavailable-icon">⚠️</div>
            <div className="unavailable-text">
              <strong>Telemetry Offline or Missing ATTITUDE</strong>
              <p>Drone model held in neutral reference pose until MAVLink packets arrive.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Attitude3DView;
