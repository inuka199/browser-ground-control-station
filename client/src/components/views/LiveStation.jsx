import React,{useEffect,useState} from 'react';
import {startStation,stopStation,stationAction,useStation} from '../../services/liveStation.js';
import {homeVector} from '../../../../shared/homeGuidance.js';
import './LiveStation.css';

const number = (v,n=0)=>Number.isFinite(v)?v.toFixed(n):'—';
const labels = {radius:'Maximum horizontal distance',warning:'Early warning distance',altitude:'Maximum altitude above home',rtlAltitude:'RTL altitude above home',finalAltitude:'Final hover height (0 to land)'};

function HomePanel({state}) {
  const [view,setView]=useState('both');
  const trail=useStation(store=>store.trail);
  const p=state?.positionValid?state.position:null, home=state?.home;
  const origin=home||p;
  function point(coords) {
    const v=homeVector(origin,coords);
    if(!v)return null;
    const theta=(v.bearing||0)*Math.PI/180;
    return [v.distance*Math.sin(theta),-v.distance*Math.cos(theta)];
  }
  const vehicle=point(p), target=point(home), radius=state?.safety.radius, warning=state?.safety.warningThreshold;
  const center=view==='aircraft'&&vehicle?vehicle:[0,0];
  const extent=view==='both'?Math.max(30,(radius||0)*1.2,(state?.guidance?.distance||0)*1.25):60;
  const project=v=>[200+(v[0]-center[0])*145/extent,165+(v[1]-center[1])*145/extent];
  const ac=vehicle&&project(vehicle), h=target&&project(target),g=state?.guidance;
  return <article className="workspace-card"><h2>Home guidance</h2>
    <div className="home-compass" role="status"><b aria-label="Home direction" style={{transform:'rotate('+(g?.relativeBearing??0)+'deg)'}}>{Number.isFinite(g?.relativeBearing)?'↑':'·'}</b>
      <div><strong>{!home?'Home not confirmed':!g?'Position unavailable':g.nearHome?'At home':number(g.distance)+' m to home'}</strong>
      <div>{g?.bearing!=null?number(g.bearing)+'° true bearing':''} {g && !g.nearHome && g.relativeBearing==null?' · Heading unavailable':''}</div></div></div>
    <svg viewBox="0 0 400 330" role="img" aria-label="North-up local map of aircraft, home and distance boundaries">
      <rect width="400" height="330" fill="#132533"/><path d="M0 165 H400 M200 0 V330" stroke="#45616e"/><text x="10" y="22">N ↑</text>
      {h&&Number.isFinite(radius)&&<circle cx={h[0]} cy={h[1]} r={radius*145/extent} stroke="#f9a866" fill="none"/>}
      {h&&Number.isFinite(warning)&&<circle cx={h[0]} cy={h[1]} r={warning*145/extent} stroke="#ffe39b" strokeDasharray="4 4" fill="none"/>}
      {origin&&<polyline points={trail.map(t=>project(point(t)).join(',')).join(' ')} fill="none" stroke="#65acda"/>}
      {ac&&h&&<line x1={ac[0]} y1={ac[1]} x2={h[0]} y2={h[1]} stroke="white" strokeDasharray="6 4"/>}
      {h&&<g transform={'translate('+h.join(' ')+')'}><rect x="-6" y="-6" width="12" height="12" fill="#62e6b0"/><text x="9" y="-8">HOME</text></g>}
      {ac&&<g transform={'translate('+ac.join(' ')+')'}>{Number.isFinite(state.heading)?<path d="M0 -11 L7 8 L0 5 L-7 8 Z" fill="#ffc56b" transform={'rotate('+state.heading+')'}/>:<circle r="5" fill="#ffc56b"/>}</g>}
    </svg>
    <div className="workspace-actions"><button onClick={()=>setView('both')}>Show aircraft and home</button><button onClick={()=>setView('aircraft')}>Follow aircraft</button></div>
    <small>North up · Half-height {number(extent*165/145)} m · Dashed line shows direction only. Terrain and obstacles are unknown.</small>
    <p>{home?'HOME '+number(home.latitude,6)+', '+number(home.longitude,6):'Awaiting HOME_POSITION from this aircraft.'}</p>
    {state?.safety.rallyPossible&&<p>RTL may use a rally point. The HOME marker always shows the autopilot’s home.</p>}
  </article>;
}
function SafetyPanel({s,owned,preview,result}) {
  const [values,setValues]=useState({}),[localError,setError]=useState('');
  const editable=owned&&!!s?.safety.profile&&s?.heartbeat?.isArmed===false&&!s?.safety.applying;
  function submit(e){
    e.preventDefault();
    const parsed=Object.fromEntries(Object.keys(labels).map(k=>[k,values[k]?.trim()?Number(values[k]):NaN]));
    if(Object.values(parsed).some(v=>!Number.isFinite(v))){setError('Choose every limit before previewing.');return;}
    setError('');stationAction({type:'PREVIEW_SAFETY',values:parsed});
  }
  return <article className="workspace-card"><h2>Distance protection</h2>
    <p>Onboard fence <strong>{s?.safety.status??'UNKNOWN'}</strong> · {number(s?.safety.radius)} m horizontal · {number(s?.safety.altitude)} m ceiling ({s?.safety.altitudeFrame??'unknown frame'})</p>
    {s?.safety.warningState==='WARNING'&&<p role="alert">Approaching the distance limit.</p>}
    {s?.safety.warningState==='BREACH'&&<p role="alert">Measured distance has reached the configured radius.</p>}
    {s?.fence?.breached&&<p role="alert">Autopilot reports a fence breach.</p>}
    <p>Loiter can stop before the horizontal boundary. An enabled onboard fence handles breaches according to its configured action.</p>
    <button disabled={!s?.link.aircraft} onClick={()=>stationAction({type:'REFRESH_SAFETY'})}>Refresh onboard settings</button>
    <form onSubmit={submit}><fieldset disabled={!editable}><legend>Proposed limits in metres</legend>
      {Object.entries(labels).map(([key,label])=><label key={key}>{label}<input type="number" step="any" required value={values[key]??''} onChange={e=>{useStation.setState({preview:null});setValues({...values,[key]:e.target.value});}}/></label>)}
      <button>Preview changes</button></fieldset></form>
    {!editable&&<p>Editing requires exclusive live control, a fresh disarmed heartbeat and a supported firmware profile.</p>}
    {localError&&<p role="alert">{localError}</p>}
    {preview&&<section><h3>Review onboard changes</h3><ul>{preview.changes.map(c=><li key={c.name}>{c.name}: {c.before} → {c.value} {c.unit}</li>)}</ul><p>Early warning {preview.warning} m · RTL with LAND fallback. Existing fence regions share this action.</p><button disabled={!editable} onClick={()=>stationAction({type:'APPLY_SAFETY',previewId:preview.id})}>Apply to disarmed aircraft</button></section>}
    {result&&<section role="status"><strong>{result.status}</strong><ul>{result.results.map(r=><li key={r.name}>{r.name} · {r.status}</li>)}</ul></section>}
  </article>;
}
export default function LiveStation() {
  const station=useStation(),[now,setNow]=useState(()=>performance.now()),[secret,setSecret]=useState(''),[takeoff,setTakeoff]=useState('');
  useEffect(()=>{startStation();const id=setInterval(()=>setNow(performance.now()),200);return ()=>{clearInterval(id);stopStation();};},[]);
  const s=station.received!=null && now-station.received<1000?station.state:null;
  const owned=!!s?.control.owned&&!!s.link.aircraft, busy=!!s?.pending||!!s?.safety.applying;
  const param=name=>s?.link.aircraft && s?.parameters[name]?.age<45000 ? s.parameters[name].value : null;
  const rtlAllowed=owned&&!busy&&s.heartbeat?.isArmed&&s.positionValid&&!!s.home;
  const act=message=>stationAction(message);
  const confirmCommand=(message,question)=>{if(window.confirm(question))act(message);};
  return <section className="workspace-page live-station"><h1>Live station</h1>
    <p><strong>LIVE</strong> · Browser link {s?'connected':station.status==='Connected'?'waiting for fresh data':station.status} · Aircraft {s?.link.aircraft?'connected':'unknown / stale'}</p>
    {station.status==='Authentication required'&&<form onSubmit={e=>{e.preventDefault();act({type:'AUTH',token:secret});setSecret('');}}><label>Bridge access token <input type="password" autoComplete="off" value={secret} onChange={e=>setSecret(e.target.value)}/></label><button>Authenticate</button></form>}
    <p>{s?.identity?(s.identity.supported?'ArduPilot Copter':'Unsupported aircraft')+' · vehicle type '+s.identity.vehicleType+' · system/component '+s.identity.systemId+'/'+s.identity.componentId:'Waiting for autopilot identity'} · Firmware {s?.version?.version??'unknown'}</p>
    <div className="workspace-actions"><button disabled={!s?.control.enabled||!s?.identity?.supported||!s?.version||!s?.link.aircraft||(s.control.owner&&!owned)} onClick={()=>act({type:owned?'RELEASE_CONTROL':'CLAIM_CONTROL'})}>{owned?'Release control':s?.control.owner?'Another operator has control':'Acquire live control'}</button>
    <button className="rtl-button" disabled={!rtlAllowed} onClick={()=>confirmCommand({type:'RTL',confirm:true},'Request RTL from this aircraft? Review home, rally points and return clearance.')}>Return to home / RTL</button></div>
    <p role="status">{station.message||(!s?.control.enabled?'Observation mode':'Select Acquire live control to operate this aircraft.')}</p>
    <div className="station-grid"><HomePanel key={[s?.sessionId,s?.home?.latitude,s?.home?.longitude].join('/')} state={s}/>
    <article className="workspace-card"><h2>Flight status</h2><dl>{Object.entries({
      Mode:s?.heartbeat?.flightMode,Arming:s?.heartbeat?(s.heartbeat.isArmed?'Armed':'Disarmed'):null,Return:s?.returnState,Altitude:s?.position?number(s.position.relativeAltitude,1)+' m above home':null,
      GPS:s?.gps?'Fix '+s.gps.fixType:null,EKF:s?.ekf?(s.ekf.healthy?'Position estimate valid':'Degraded'):null,Battery:s?.battery?.remaining!=null?s.battery.remaining+'%':null,
      'RC-loss action':param('FS_THR_ENABLE'),'GCS-loss action':param('FS_GCS_ENABLE'),'Battery low / critical actions':param('BATT_FS_LOW_ACT')!=null && param('BATT_FS_CRT_ACT')!=null?param('BATT_FS_LOW_ACT')+' / '+param('BATT_FS_CRT_ACT'):null
    }).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value??'Unknown'}</dd></div>)}</dl>
    <details><summary>Source ages and firmware capabilities</summary><p>Capability bitmask {s?.version?.capabilities??'unknown'}</p>{Object.entries(s?.link.ages??{}).map(([k,v])=><div key={k}>{k} · {v==null?'unseen':number(v/1000,1)+' s'}</div>)}</details>
    <details><summary>Onboard parameters</summary><dl>{Object.entries(s?.parameters??{}).map(([k,p])=><div key={k}><dt>{k}</dt><dd>{p.age>=45000?'Stale':p.value}</dd></div>)}</dl></details>
    <h3>Vehicle messages</h3>{s?.warnings.slice(-5).map((w,i)=><p key={i}>{w.text}</p>)}</article>
    <SafetyPanel key={s?.sessionId||'none'} s={s} owned={owned} preview={station.preview} result={station.result}/>
    <article className="workspace-card"><h2>Aircraft commands</h2><fieldset disabled={!owned||busy}>
      {['STABILIZE','ALT_HOLD','GUIDED','LOITER','LAND'].map(mode=><button key={mode} disabled={mode===s?.heartbeat?.flightMode} onClick={()=>confirmCommand({type:'SET_MODE',mode},'Request '+mode+' on this aircraft?')}>{mode}</button>)}
      {[0,1].map(flag=><button key={flag} disabled={!s?.heartbeat||flag===Number(s.heartbeat.isArmed)||(!flag&&s?.landed?.state!==1)} onClick={()=>confirmCommand({type:'COMMAND_LONG',command:400,params:[flag,0,0,0,0,0,0]},flag?'Arm the aircraft?':'Disarm the landed aircraft?')}>{flag?'Arm':'Disarm'}</button>)}
      <label>Takeoff height (m)<input type="number" value={takeoff} onChange={e=>setTakeoff(e.target.value)}/></label><button disabled={!s?.heartbeat?.isArmed||s.heartbeat.flightMode!=='GUIDED'||!(Number(takeoff)>=2&&Number(takeoff)<=100)} onClick={()=>confirmCommand({type:'COMMAND_LONG',command:22,params:[0,0,0,0,0,0,Number(takeoff)]},'Request takeoff?')}>Request takeoff</button></fieldset></article></div>
  </section>;
}
