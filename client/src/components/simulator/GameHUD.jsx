import React from 'react';
import { Link } from 'react-router-dom';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';
import { hasLivePosition } from './flightDynamics.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { usePayloadStore } from '../../store/slices/payload.js';
import { useChallengeStore } from '../../store/slices/challenges.js';
import EnvironmentControls from './EnvironmentControls.jsx';
import SoundControls from './SoundControls.jsx';
import './SimpleFlight.css';

const CAMERAS=[['chase','Chase'],['fpv','FPV'],['top','Top'],['side','Side'],['free','Free']];
const number=(v,d=1)=>Number.isFinite(v) ? v.toFixed(d) : '—';
function Instrument({label,value,unit}) {
  return <div className="hud-instrument"><span className="hud-instr-label">{label}</span><span className="hud-instr-value">{value}<small> {unit}</small></span></div>;
}
export default function GameHUD({onPause,fcpOpen,onToggleFcp}) {
  const {data:telemetry,status,now}=useTelemetryHealth();
  const sim=useSimulatorStore();
  const challenge=useChallengeStore(s=>s.active);
  const rangefinder=usePayloadStore(s=>s.rangefinder);
  const live=hasLivePosition(telemetry,status==='connected',now);
  const data=live ? telemetry : sim.demoData;
  const attribution=sim.tilesEnabled && sim.tilesStatus!=='idle' && <div className="hud-tiles-attribution" aria-label="Map attribution">{sim.tilesAttribution}</div>;
  if(!sim.isHudVisible) return <><div className="hud-hidden-bar"><button className="hud-show-btn" onClick={sim.toggleHud}>Show controls · H</button></div>{attribution}</>;
  return <div className="game-hud simple-flight" aria-label="Flight HUD">
    <div className="flight-topbar">
      <div className="flight-identity"><Link to="/" aria-label="Back to dashboard">← Home</Link><span className={live?'flight-live':''}>{live?'Live flight':'Offline flight'}</span></div>
      <div className="flight-cameras" role="group" aria-label="Camera mode">{CAMERAS.map(([id,label],i)=><button key={id} id={'cam-btn-'+id} aria-pressed={sim.cameraMode===id} onClick={()=>sim.setCameraMode(id)} title={label+' camera ['+(i+1)+']'}>{label}</button>)}</div>
      <div className="flight-actions"><SoundControls compact/><button onClick={onPause} title="Pause [Esc]">Pause</button></div>
    </div>
    <div className="flight-settings-anchor"><EnvironmentControls compact>
      <details className="flight-advanced"><summary>Recording & flight tools</summary>
        <div className="flight-tool-buttons"><button onClick={sim.isRecording?sim.stopRecording:sim.startRecording} aria-pressed={sim.isRecording}>{sim.isRecording?'Stop & save recording':'Record flight'}</button>
        <Link to="/recordings">Recordings</Link><Link to="/challenges">Challenges</Link><Link to="/garage">Choose drone</Link>
        {sim.flownPath.length>1 && <Link to="/environment">Replay flight</Link>}
        <button onClick={onToggleFcp} aria-pressed={fcpOpen}>Live commands · F</button>
        <button disabled={!!challenge} onClick={sim.toggleTiles}>{sim.tilesEnabled?'Disable':'Enable'} Google tiles · B</button></div>
        <p>{sim.tilesStatus==='ready'?'Google tiles active':sim.tilesStatus==='no-key'?'Google tiles need an API key':sim.tilesStatus==='error'?'Tiles unavailable · Coastal world active':sim.tilesStatus==='loading'?'Loading Google tiles…':'Offline coastal world'}</p>
      </details>
      <details className="flight-advanced"><summary>Detailed instruments</summary><dl className="flight-details">
        <dt>Flight mode</dt><dd>{data.flightMode||'—'}</dd><dt>Roll / pitch</dt><dd>{number(data.roll)}° / {number(data.pitch)}°</dd>
        <dt>Altitude MSL</dt><dd>{number(data.altitude)} m</dd><dt>Voltage</dt><dd>{number(data.batteryVoltage,2)} V</dd>
        <dt>Armed</dt><dd>{data.isArmed==null?'—':data.isArmed?'Yes':'No'}</dd>
      </dl></details>
    </EnvironmentControls></div>
    {sim.isRecording && <span className="flight-recording">● Recording <button onClick={sim.stopRecording}>Stop & save</button></span>}
    {sim.buildingDistance<10 && !sim.isGrounded && <div role="alert" className="flight-warning">Building nearby · {number(sim.buildingDistance)} m</div>}
    {sim.cameraMode==='fpv' && <div className="hud-reticle" aria-hidden="true"><div className="reticle-h"/><div className="reticle-v"/><div className="reticle-ring"/></div>}
    {!live && sim.isGrounded && !sim.isDestroyed && <div className="flight-takeoff">Hold <kbd>W</kbd> to take off <span>· Arrows to fly</span></div>}
    <div className="hud-instruments">
      <Instrument label="Altitude" value={number(data.relativeAltitude)} unit="m"/>
      <Instrument label="Speed" value={number(data.groundSpeed)} unit="m/s"/>
      <Instrument label="Heading" value={number(data.yaw,0)} unit="°"/>
      {live && <Instrument label="Battery" value={number(data.batteryRemaining,0)} unit="%"/>}
      {rangefinder && <Instrument label="Ground below" value={number(sim.rangefinderDistance)} unit="m"/>}
    </div>
    {attribution}
  </div>;
}
