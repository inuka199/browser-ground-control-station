import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import SoundControls from '../simulator/SoundControls.jsx';
const CAMERAS = [['chase','Chase','Follow the aircraft from behind.'],['fpv','FPV','Look through the onboard camera.'],['top','Top down','Look down at the drone and route.'],['side','Side','Inspect altitude and attitude in profile.'],['free','Free orbit','Drag to orbit and scroll to zoom.']];
export default function ViewsView() {
  const sim = useSimulatorStore();
  return <section className="workspace-page"><PageHeader title="Camera views & display">Choose your simulator camera and display preferences.</PageHeader><div className="workspace-grid"><article className="workspace-card"><h2>Camera</h2>{CAMERAS.map(([id,label,description], index) => <div key={id}><button aria-pressed={sim.cameraMode === id} onClick={() => sim.setCameraMode(id)}>{index + 1} · {label}</button><p>{description}</p></div>)}<Link className="workspace-button" to="/simulator">Open selected view</Link></article><div className="workspace-stack"><article className="workspace-card"><h2>Display</h2><label className="workspace-inline-check"><input type="checkbox" checked={sim.isHudVisible} onChange={e => sim.setHudVisible(e.target.checked)}/> Flight instruments</label><label className="workspace-inline-check"><input type="checkbox" checked={sim.isGuideVisible} onChange={sim.toggleGuide}/> Keyboard guide</label><Link to="/gadgets" className="workspace-button">Configure FPV camera</Link></article><article className="workspace-card"><SoundControls/></article></div></div></section>;
}
