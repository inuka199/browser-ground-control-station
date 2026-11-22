import { create } from 'zustand';
import { useCommandStore } from '../store/slices/commands.js';

const bridgeUrl = import.meta.env.VITE_WS_URL || (['localhost','127.0.0.1','[::1]'].includes(location.hostname) ? 'ws://127.0.0.1:8080' : null);
const initial = { state:null, received:null, status:'Offline', trail:[], preview:null, result:null, message:'' };
export const useStation = create(()=>({...initial}));
const samples=new Map();
let authenticated=false;
let socket=null, pulse=null, reconnect=null, active=false;
const update = patch=>useStation.setState(patch);
function transmit(message) {
  if(!active || location.pathname!=='/live' || socket?.readyState!==WebSocket.OPEN)return false;
  try {socket.send(JSON.stringify(message));return true;} catch {return false;}
}
// Only the mounted live station can open the command socket.
export function startStation() {
  stopStation(); active=true;update({...initial});
  if(!bridgeUrl){update({message:'Configure VITE_WS_URL to connect this station.'});return;}
  function connect() {
    if(!active)return;
    let newestSample=-Infinity;
    try {
      const url=new URL(bridgeUrl);if(url.protocol!=='wss:' && !['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Remote bridge requires WSS');url.pathname='/live';url.search='';
      socket=new WebSocket(url);
    } catch {update({message:'Invalid bridge URL'});return;}
    socket.onopen=()=>update({status:'Connected'});
    socket.onmessage=event=>{
      let data;try{data=JSON.parse(event.data);}catch{return;}
      if(data.type==='AUTH_REQUIRED'){update({status:'Authentication required'});return;}
      let requestTime=null;
      if(data.type==='GCS_STATE') {
        authenticated=true;
        const sent=samples.get(data.nonce);
        samples.delete(data.nonce);
        if(sent===undefined || sent<=newestSample || performance.now()-sent>=750)return;
        newestSample=sent;
        requestTime=sent;
      }
      if(data.type==='GCS_STATE'&&typeof data.sessionId==='string'&&data.control&&data.link){
        const old=useStation.getState().state;
        if(old?.sessionId!==data.sessionId)update({preview:null,result:null,message:''});
        if(!data.control.owned)update({preview:null});
        const trail = old?.sessionId===data.sessionId && old?.home?.latitude===data.home?.latitude && old?.home?.longitude===data.home?.longitude ? useStation.getState().trail : [];
        const p=data.positionValid?data.position:null,last=trail.at(-1);
        update({state:data,received:requestTime,status:'Connected',trail:p&&(last?.latitude!==p.latitude||last?.longitude!==p.longitude)?[...trail.slice(-399),p]:trail});return;
      }
      if(data.type==='SAFETY_PREVIEW')update({preview:data.preview,result:null});
      if(data.type==='SAFETY_RESULT')update({result:data,preview:null,message:data.message});
      if(data.type==='COMMAND_STATUS'){
        update({message:data.message});const c=useCommandStore.getState();
        if(['SUBMITTED','ACCEPTED'].includes(data.status))c.setPending(data.label,data.message);
        else if(['CONFIRMED','RTL_ACTIVE'].includes(data.status))c.setSuccess(data.message);
        else c.setError(data.message);
      }
    };
    socket.onclose=()=>{authenticated=false;samples.clear();update({...initial,message:'Connection closed. Reacquire control after reconnecting.'});if(active)reconnect=setTimeout(connect,1500);};
  }
  connect();
  let lastPulse=-Infinity;
  pulse=setInterval(()=>{
    if(!authenticated)return;
    const now=performance.now();for(const [key,at] of samples)if(now-at>=750)samples.delete(key);
    const nonce=crypto.randomUUID();samples.set(nonce,now);transmit({type:'SAMPLE',nonce});
    const {state,received}=useStation.getState();
    if(state?.control.owned && !document.hidden && now-received<750 && now-lastPulse>=700) { lastPulse=now;
      transmit({type:'OPERATOR_HEARTBEAT',sessionId:state.sessionId});
    }
  },200);
}
export function stopStation() {
  if(socket){transmit({type:'RELEASE_CONTROL'});socket.onmessage=socket.onclose=socket.onopen=null;socket.close();socket=null;}
  authenticated=false;samples.clear();active=false;clearInterval(pulse);clearTimeout(reconnect);update({...initial});
}
export function stationAction(message) {
  if(message.type==='AUTH')return transmit(message);
  const {state,received}=useStation.getState();
  if(!state || performance.now()-received>=1000 || document.hidden)return false;
  if(!['CLAIM_CONTROL','RELEASE_CONTROL','REFRESH_SAFETY'].includes(message.type)&&!state.control.owned)return false;
  return transmit({...message,requestId:crypto.randomUUID(),context:'LIVE',sessionId:state.sessionId});
}
export function legacyTelemetry(s,now=Date.now()){
  const p=s.position, a=s.attitude, ages=s.link.ages;
  const valid=s.link.aircraft&&p&&(s.gps==null||s.gps.fixType>=3);
  return {latitude:valid?p.latitude:null,longitude:valid?p.longitude:null,altitude:valid?p.altitude:null,relativeAltitude:valid?p.relativeAltitude:null,
    groundSpeed:valid?p.groundSpeed:null,roll:a?.roll,pitch:a?.pitch,yaw:a?.yaw,systemId:s.identity?.systemId,gpsFixType:s.gps?.fixType,
    isArmed:s.heartbeat?.isArmed??null,flightMode:s.heartbeat?.flightMode??null,batteryRemaining:s.battery?.remaining??null,batteryVoltage:s.battery?.voltage??null,
    positionTimestamp:valid?now-ages.position:null,timestamp:valid&&a?now-Math.max(ages.position,ages.attitude):null};
}
