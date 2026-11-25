import React, { useEffect, useState } from 'react';
import { useEnvironmentStore } from '../../store/slices/environment.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { formatWorldTime, solarState } from './world/environmentMath.js';
import './EnvironmentControls.css';
import SoundControls from './SoundControls.jsx';

const PRESETS = [{label:'Dawn',hour:6.4},{label:'Day',hour:12},{label:'Golden',hour:17.3},{label:'Night',hour:22}];

export default function EnvironmentControls({ compact = false, children }) {
  const [open,setOpen]=useState(false);
  const time=useEnvironmentStore(s=>s.timeOfDay), cycle=useEnvironmentStore(s=>s.cycleEnabled);
  const minutes=useEnvironmentStore(s=>s.cycleMinutes), quality=useEnvironmentStore(s=>s.quality);
  const cityLife=useEnvironmentStore(s=>s.cityLife), haze=useEnvironmentStore(s=>s.haze);
  const weatherMode=useEnvironmentStore(s=>s.weatherMode);
  const wind=useEnvironmentStore(s=>s.wind);
  const tilesStatus=useSimulatorStore(s=>s.tilesStatus);
  const actions=useEnvironmentStore.getState();
  useEffect(()=>{
    const onKey=event=>{
      if(event.code==='KeyI' && !event.repeat && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && !event.target.isContentEditable) setOpen(value=>!value);
    };
    window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey);
  },[]);
  return <section className="sim-environment" aria-label="Environment settings">
    <button className="environment-toggle" onClick={()=>setOpen(!open)} aria-expanded={open} aria-controls="environment-settings" title="Environment settings [I]">
      <span className="environment-sun" aria-hidden="true">{solarState(time).night>0.5 ? '☾' : '☀'}</span>
      <span><strong>{compact ? 'Flight settings' : formatWorldTime(time)}</strong><span className="environment-toggle-label">{compact ? formatWorldTime(time) : 'COLOMBO COAST'}</span></span>
      <span className="environment-toggle-end"><span aria-hidden="true">{open ? '−' : '+'}</span></span>
    </button>
    {open && <div id="environment-settings" className="environment-settings">
      <div className="environment-heading"><span>MAKE IT YOUR SKY</span><kbd>I</kbd></div>
      <div className="environment-presets" aria-label="Time presets">{PRESETS.map(p=><button key={p.label} aria-pressed={Math.abs(time-p.hour)<0.2} onClick={()=>actions.setTimeOfDay(p.hour)}>{p.label}</button>)}</div>
      <label className="environment-range"><span>Time of day <output>{formatWorldTime(time)}</output></span><input aria-label="Time of day" type="range" min="0" max="23.99" step="0.01" value={time} onChange={e=>actions.setTimeOfDay(Number(e.target.value))}/></label>
      <label className="environment-check"><span>Day / night cycle</span><input type="checkbox" checked={cycle} onChange={e=>actions.setCycleEnabled(e.target.checked)}/></label>
      {cycle && <label className="environment-select"><span>Full day in</span><select aria-label="Day cycle duration" value={minutes} onChange={e=>actions.setCycleMinutes(Number(e.target.value))}><option value="2">2 minutes</option><option value="8">8 minutes</option><option value="20">20 minutes</option><option value="60">1 hour</option></select></label>}
      <label className="environment-range"><span>Coastal haze <output>{Math.round(haze*100)}%</output></span><input aria-label="Coastal haze" type="range" min="0" max="1" step="0.05" value={haze} onChange={e=>actions.setHaze(Number(e.target.value))}/></label>
      <label className="environment-select"><span>Simulator weather</span>
        <select value={weatherMode} onChange={e=>actions.setWeatherMode(e.target.value)}>
          <option value="auto">Occasional storms</option>
          <option value="storm">Thunderstorm</option>
          <option value="clear">Clear skies</option>
        </select>
      </label>
      <label className="environment-range"><span>Cloud wind speed <output>{wind.speedMs} m/s</output></span>
        <input aria-label="Cloud wind speed" type="range" min="0" max="18" step="1" value={wind.speedMs} onChange={e=>actions.setWind({speedMs:Number(e.target.value)})}/>
      </label>
      <label className="environment-select"><span>Clouds drift toward</span>
        <select value={wind.directionDeg} onChange={e=>actions.setWind({directionDeg:Number(e.target.value)})}>
          {['North','Northeast','East','Southeast','South','Southwest','West','Northwest'].map((name,i)=><option key={name} value={i*45}>{name}</option>)}
        </select>
      </label>
      <label className="environment-check"><span>Traffic & pedestrians</span><input type="checkbox" disabled={tilesStatus==='ready'} checked={cityLife} onChange={e=>actions.setCityLife(e.target.checked)}/></label>
      <label className="environment-select"><span>Graphics quality</span><select aria-label="Graphics quality" value={quality} onChange={e=>actions.setQuality(e.target.value)}><option value="low">Low</option><option value="balanced">Balanced</option><option value="high">High</option></select></label>
      <p>{quality==='high' ? 'Full resolution, detailed shadows and light bloom.' : quality==='low' ? 'Lighter rendering with fewer people and vehicles.' : 'Soft shadows and city life at a balanced resolution.'}</p>
      <SoundControls />{children}
    </div>}
  </section>;
}
