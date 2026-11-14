// FlightPath3DView.jsx
// 3D visualizer for drone flight path using Three.js.
// Receives latitude, longitude, altitude (MSL) and relativeAltitude (above home) via props.
// Uses local ENU coordinate frame derived from first valid GPS fix.
// Includes orbit controls, clear path, reset view, and optional follow‑drone mode.

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Helper: convert lat/lon delta to metres (approximate Earth radius)
function latLonToMeters(lat, lon, originLat, originLon) {
  const R = 6378137; // Earth radius in metres
  const dLat = THREE.MathUtils.degToRad(lat - originLat);
  const dLon = THREE.MathUtils.degToRad(lon - originLon);
  const latRad = THREE.MathUtils.degToRad(originLat);
  const x = dLon * Math.cos(latRad) * R; // East
  const y = dLat * R; // North
  return { x, y };
}

const FlightPath3DView = ({ latitude, longitude, altitude, relativeAltitude }) => {
  const mountRef = useRef(null);
  const controlsRef = useRef(null);
  const cameraRef = useRef(null);
  const sceneRef = useRef(null);
  const droneRef = useRef(null);
  const pathLineRef = useRef(null);
  const originRef = useRef(null); // {lat, lon, alt}
  const pointsRef = useRef([]); // Array of THREE.Vector3
  const followRef = useRef(false);

  // UI state
  const [followEnabled, setFollowEnabled] = useState(false);

  // Initialize Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = null; // transparent for glass‑morphism
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 2000);
    camera.position.set(0, 5, 15);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxDistance = 200;
    controls.minDistance = 1;
    controls.target.set(0, 0, 0);
    controlsRef.current = controls;

    // Light
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0xffffff, 2.0);
    dir1.position.set(4, 8, 4);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0x38bdf8, 1.0);
    dir2.position.set(-4, -2, -4);
    scene.add(dir2);

    // Ground grid
    const grid = new THREE.GridHelper(200, 40, 0x3b82f6, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    // Axes helper (X red, Y green, Z blue)
    const axes = new THREE.AxesHelper(5);
    scene.add(axes);

    // Drone marker (simple sphere)
    const droneGeom = new THREE.SphereGeometry(0.4, 16, 16);
    const droneMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24 }); // amber
    const drone = new THREE.Mesh(droneGeom, droneMat);
    drone.castShadow = true;
    scene.add(drone);
    droneRef.current = drone;

    // Flight path line (initially empty)
    const lineGeom = new THREE.BufferGeometry();
    const lineMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, linewidth: 2 });
    const line = new THREE.Line(lineGeom, lineMat);
    scene.add(line);
    pathLineRef.current = line;

    // Animation loop
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      // Follow‑drone mode – keep camera targeting the latest position
      if (followRef.current && droneRef.current) {
        const pos = droneRef.current.position;
        controls.target.copy(pos);
        const offset = new THREE.Vector3(0, 5, 15);
        camera.position.copy(pos).add(offset);
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    // Resize handling
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width: w, height: h } = entry.contentRect;
        if (w > 0 && h > 0) {
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        }
      }
    });
    resizeObserver.observe(container);

    // Cleanup
    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Process incoming telemetry updates
  useEffect(() => {
    if (latitude == null || longitude == null) return;

    // Establish origin on first valid fix
    if (!originRef.current) {
      originRef.current = { lat: latitude, lon: longitude, alt: altitude ?? 0 };
    }
    const { x, y } = latLonToMeters(latitude, longitude, originRef.current.lat, originRef.current.lon);
    const z = relativeAltitude != null ? relativeAltitude : (altitude != null ? altitude - originRef.current.alt : 0);
    const newPos = new THREE.Vector3(x, z, -y); // Z forward (North = -Z)

    // Filter jitter – ignore changes < 0.5 m
    const lastPos = pointsRef.current[pointsRef.current.length - 1];
    if (lastPos && newPos.distanceTo(lastPos) < 0.5) return;

    // Append point and cap memory usage
    pointsRef.current.push(newPos.clone());
    if (pointsRef.current.length > 5000) pointsRef.current.shift(); // ~5 km history

    // Update line geometry
    const positions = new Float32Array(pointsRef.current.length * 3);
    pointsRef.current.forEach((pt, i) => {
      positions[i * 3] = pt.x;
      positions[i * 3 + 1] = pt.y;
      positions[i * 3 + 2] = pt.z;
    });
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    if (pathLineRef.current) {
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.geometry = lineGeom;
    }

    // Move drone marker
    if (droneRef.current) {
      droneRef.current.position.copy(newPos);
    }
  }, [latitude, longitude, altitude, relativeAltitude]);

  const handleClearPath = () => {
    pointsRef.current = [];
    if (pathLineRef.current) {
      pathLineRef.current.geometry.dispose();
      pathLineRef.current.geometry = new THREE.BufferGeometry();
    }
  };

  const handleResetView = () => {
    if (cameraRef.current && controlsRef.current) {
      cameraRef.current.position.set(0, 5, 15);
      controlsRef.current.target.set(0, 0, 0);
      controlsRef.current.update();
    }
  };

  const toggleFollow = () => {
    setFollowEnabled((prev) => !prev);
    followRef.current = !followRef.current;
  };

  return (
    <div className="flightpath-3d-card" aria-label="3D Flight Path Viewer">
      <div className="flightpath-3d-header">
        <h3>3D Flight Path</h3>
        <div className="flightpath-controls-toolbar">
          <button className="btn-view" onClick={handleResetView}>Reset View</button>
          <button className="btn-view" onClick={handleClearPath}>Clear Path</button>
          <button className={`btn-view ${followEnabled ? 'active' : ''}`} onClick={toggleFollow}>
            {followEnabled ? 'Follow: ON' : 'Follow: OFF'}
          </button>
        </div>
      </div>
      <div className="flightpath-viewport-container">
        <div ref={mountRef} className="flightpath-canvas-wrapper" />
      </div>
    </div>
  );
};

export default FlightPath3DView;
