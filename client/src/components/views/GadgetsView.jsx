import React from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { usePayloadStore } from '../../store/slices/payload.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
export default function GadgetsView() {
  const settings = usePayloadStore(), navigate = useNavigate();
  return <section className="workspace-page"><PageHeader title="Camera & payloads">Configure the onboard camera and a simulated downward rangefinder.</PageHeader><div className="workspace-grid">
    <article className="workspace-card"><h2>FPV camera</h2><label>Field of view · {settings.fov}°<input aria-label="Camera field of view" type="range" min="35" max="100" value={settings.fov} onChange={e => settings.setFov(Number(e.target.value))}/></label><label>Camera tilt · {settings.tilt}° down<input aria-label="Camera tilt" type="range" min="-30" max="85" value={settings.tilt} onChange={e => settings.setTilt(Number(e.target.value))}/></label><p>A narrower field of view magnifies the scene. Positive tilt looks toward the ground.</p><button onClick={() => { useSimulatorStore.getState().setCameraMode('fpv'); navigate('/simulator'); }}>Fly with this camera</button></article>
    <article className="workspace-card"><h2>Downward rangefinder</h2><label className="workspace-inline-check"><input type="checkbox" checked={settings.rangefinder} onChange={e => settings.setRangefinder(e.target.checked)}/> Show ground clearance in the flight HUD</label><p>Measures distance to the ground or building roofs in the coastal city. This is a simulated sensor; Google tiles do not expose these collision surfaces.</p><div className="workspace-actions"><button onClick={settings.reset}>Reset camera and sensor</button></div></article>
  </div></section>;
}
