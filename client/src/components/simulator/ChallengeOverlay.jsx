import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CHALLENGES, useChallengeStore } from '../../store/slices/challenges.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { enableFlightAudio } from './flightAudio.js';
import './ChallengeOverlay.css';

export default function ChallengeOverlay() {
  const {active,lastOutcome,startChallenge,dismissOutcome,triggerAction}=useChallengeStore();
  const destroyed=useSimulatorStore(s=>s.isDestroyed),paused=useSimulatorStore(s=>s.isPaused);
  const restartSerial=useSimulatorStore(s=>s.restartSerial);
  const reason=useSimulatorStore(s=>s.destructionReason);
  const hudVisible=useSimulatorStore(s=>s.isHudVisible);
  const resultKey=lastOutcome || (destroyed ? 'crash-'+restartSerial : null);
  const [revealed,setRevealed]=useState(null);
  useEffect(()=>{
    if(!resultKey) return;
    const timer=setTimeout(()=>setRevealed(resultKey),1800);
    return ()=>clearTimeout(timer);
  },[resultKey]);
  const retry=()=>{
    const id=lastOutcome?.id;
    dismissOutcome();
    if(id) startChallenge(id);
    useSimulatorStore.getState().restartDemo();
    void enableFlightAudio();
  };
  if(resultKey && revealed!==resultKey) return <div className="challenge-result-toast" role="status">{destroyed ? 'Drone destroyed' : lastOutcome.status==='complete' ? 'Mission complete' : 'Challenge ended'}</div>;
  if(destroyed || lastOutcome) return <section className="challenge-result" role="status" aria-label="Flight result">
    <span className="challenge-eyebrow">{lastOutcome?.status==='complete' ? 'CHALLENGE COMPLETE' : 'FLIGHT ENDED'}</span>
    <h2>{lastOutcome?.status==='complete' ? CHALLENGES.find(item=>item.id===lastOutcome.id)?.title : destroyed ? 'Drone destroyed' : CHALLENGES.find(item=>item.id===lastOutcome.id)?.title}</h2>
    <p>{lastOutcome?.message || reason || 'All objectives completed.'}</p>
    {lastOutcome?.status==='complete' && <p>{lastOutcome.score}/100 · {lastOutcome.elapsed.toFixed(1)} seconds</p>}
    <div><button onClick={retry}>{lastOutcome ? 'Retry challenge' : 'Restart flight'}</button><Link to="/challenges">Choose challenge</Link>{!destroyed && <button onClick={dismissOutcome}>Continue exploring</button>}</div>
  </section>;
  if(!active || !hudVisible) return null;
  const definition=CHALLENGES.find(item=>item.id===active.id);
  return <section className="challenge-flight-panel" aria-label="Challenge objectives">
    <span className="challenge-eyebrow">{definition.title} · {active.stage+1}/3</span>
    <h2>{definition.objectives[active.stage]}</h2>
    <p>{active.message || (active.id==='first-flight' && active.stage===1 ? active.hover.toFixed(1)+' / 3 seconds stable hover' : 'Follow the objective using the flight controls.')}</p>
    <div className="challenge-flight-meta"><span>{active.elapsed.toFixed(1)} s</span>{Number.isFinite(active.distance) && <span>{Math.round(active.distance)} m to {active.id==='pursuit' ? 'target' : active.stage===0 ? 'A' : 'B'}</span>}{Number.isFinite(active.bearing) && <span>{Math.round(active.bearing)}° bearing</span>}</div>
    {active.id==='pursuit' && <button disabled={active.stage!==2 || paused} onClick={()=>{void enableFlightAudio();triggerAction();}}>T · Detonate target</button>}
  </section>;
}
