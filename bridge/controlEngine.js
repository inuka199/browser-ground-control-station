import { VehicleState, MODES } from './vehicleState.js';
import { buildSafetyPreview, PARAMETER_NAMES, safetySummary } from './safetyConfig.js';
import { distanceWarning } from '../shared/homeGuidance.js';

const LEASE_MS=3500, ACK_MS=1800, COMMAND_MS=9000;
export class ControlEngine {
  constructor({now=()=>performance.now(),send=()=>{},emit=()=>{},systemId=null,allowControl=false,gcsSystem=255,gcsComponent=190}={}) {
    this.now=now;this.send=send;this.emit=emit;this.vehicle=new VehicleState({now,systemId});this.allowControl=allowControl;
    this.gcsSystem=gcsSystem;this.gcsComponent=gcsComponent;this.clients=new Map();this.owner=null;this.pending=null;this.transaction=null;this.lastHeartbeat=-Infinity;this.lastDiscovery=-Infinity;this.lastPoll=-Infinity;this.readQueue=[];this.lastRead=-Infinity;this.warning=null;this.warningState='UNKNOWN';this.seenEpoch=this.vehicle.epoch;this.audit=[];
  }
  addClient(id) {this.clients.set(id,{homeRevision:this.vehicle.homeRevision,mode:'OBSERVE',seenIds:new Set(),preview:null});this.lastDiscovery=-Infinity;}
  removeClient(id) {if(this.owner?.id===id)this.release('Operator disconnected');this.clients.delete(id);}
  log(event) {this.audit=[...this.audit.slice(-49),{at:this.now(),...event}];}
  status(id,status,message,extra={}) {const event={type:'COMMAND_STATUS',status,message,...extra};this.emit(id,event);this.log(event);}
  transmit(name,fields) {
    if(!this.vehicle.endpoint||!this.vehicle.identity)throw Error('No pinned autopilot endpoint.');
    const target=this.vehicle.identity;
    this.send(name,{target_system:target.systemId,target_component:target.componentId,...fields},this.vehicle.endpoint);
  }
  requestMessage(id) {this.transmit('COMMAND_LONG',{command:512,param1:id});}
  readParameter(name) {this.transmit('PARAM_REQUEST_READ',{param_id:name,param_index:-1});}
  release(reason) {
    this.owner=null;
    if(this.pending){this.status(this.pending.client,'FAILED',`${reason}; no commands will be replayed.`,this.pending.meta);this.pending=null;}
    if(this.transaction)this.abortTransaction(reason);
    for(const c of this.clients.values())c.preview=null;
    this.log({status:'CONTROL_RELEASED',message:reason});
  }
  synchronizeEpoch() {
    if(this.seenEpoch!==this.vehicle.epoch) {
      this.release(this.vehicle.reason);this.seenEpoch=this.vehicle.epoch;this.lastDiscovery=-Infinity;this.lastPoll=-Infinity;this.readQueue=[];this.warning=null;this.warningState='UNKNOWN';
    }
  }
  ingest(message,endpoint) {
    const wasArmed=this.vehicle.value('heartbeat')?.isArmed;
    if(!this.vehicle.ingest(message,endpoint)){this.synchronizeEpoch();return;}
    this.synchronizeEpoch();
    if(message.name==='HEARTBEAT' && wasArmed!==this.vehicle.value('heartbeat')?.isArmed)
      for(const client of this.clients.values())client.preview=null;
    const f=message.fields;
    if(message.name==='COMMAND_ACK'&&this.pending&&f.command===this.pending.command) {
      if((f.target_system&&f.target_system!==this.gcsSystem)||(f.target_component&&f.target_component!==this.gcsComponent))return;
      const p=this.pending;
      if(f.result===0||f.result===5) {
        p.accepted=true;this.status(p.client,'ACCEPTED',`${p.meta.label} accepted; awaiting observed aircraft state.`,p.meta);
      } else {this.status(p.client,'REJECTED',`Autopilot rejected ${p.meta.label}: MAV_RESULT ${f.result}.`,p.meta);this.pending=null;}
    }
    if(message.name==='PARAM_VALUE')this.handleParameter(f);
    this.observeCommand();
    const p=this.pending, hb=this.vehicle.value('heartbeat');
    if(p && message.name==='HEARTBEAT' && hb && (hb.flightMode!==p.initialMode || hb.isArmed!==p.initialArmed || hb.systemStatus>=5)) {
      this.status(p.client,'FAILED','Aircraft state changed. Command monitoring ended.',p.meta);this.pending=null;
    }
    if(this.transaction && !this.transactionAllowed())this.abortTransaction('Control or disarmed state changed');
  }
  observeCommand() {
    const p=this.pending;if(!p)return;
    const state=this.vehicle.snapshot();
    if(p.goal==='RTL'&&state.heartbeat?.flightMode==='RTL') {this.status(p.client,'RTL_ACTIVE','RTL active, confirmed by autopilot heartbeat.',p.meta);this.pending=null;}
    else if(p.mode&&state.heartbeat?.flightMode===p.mode) {this.status(p.client,'CONFIRMED',`${p.mode} observed.`,p.meta);this.pending=null;}
    else if(p.arm!==undefined&&state.heartbeat?.isArmed===p.arm) {this.status(p.client,'CONFIRMED',p.arm?'Armed state observed.':'Disarmed state observed.',p.meta);this.pending=null;}
    else if(p.takeoff&&state.landed?.state===2&&state.position?.relativeAltitude>=p.startAltitude+1) {this.status(p.client,'CONFIRMED','Takeoff observed; target altitude is not yet guaranteed.',p.meta);this.pending=null;}
  }
  guard(id,msg) {
    const c=this.clients.get(id),s=this.vehicle.snapshot();
    if(!c||c.mode!=='LIVE'||msg.context!=='LIVE')throw Error('Commands are disabled in SIMULATION, REPLAY and observation contexts.');
    if(!this.allowControl)throw Error('Bridge is in observation mode.');
    if(!s.link.aircraft||!s.identity?.supported||!s.version)throw Error('Fresh ArduPilot Copter identity and firmware required.');
    if(msg.sessionId!==s.sessionId)throw Error('Vehicle session changed. Reacquire control.');
    if(this.owner?.id!==id||this.now()-this.owner.lastSeen>=LEASE_MS)throw Error('Acquire exclusive live control first.');
    return s;
  }
  handle(id,msg) {
    const c=this.clients.get(id);if(!c)return;
    try {
      if(!msg||Array.isArray(msg)||typeof msg!=='object')throw Error('Invalid message');
      if(msg.type==='SET_CONTEXT') {
        if(!['LIVE','SIMULATION','REPLAY','OBSERVE'].includes(msg.context))throw Error('Invalid operation context');
        if(this.owner?.id===id&&msg.context!=='LIVE')this.release('Operator left live control');c.mode=msg.context;c.preview=null;return;
      }
      if(msg.type==='OPERATOR_HEARTBEAT') {if(this.owner && this.now()-this.owner.lastSeen>=LEASE_MS)this.release('Operator lease expired');if(this.owner?.id===id&&c.mode==='LIVE'&&msg.sessionId===this.vehicle.sessionId)this.owner.lastSeen=this.now();return;}
      if(msg.type==='RELEASE_CONTROL') {if(this.owner?.id===id)this.release('Operator released control');return;}
      if(msg.type==='CLAIM_CONTROL') {
        const s=this.vehicle.snapshot();
        if(!this.allowControl||c.mode!=='LIVE'||msg.context!=='LIVE'||msg.sessionId!==s.sessionId||!s.link.aircraft||!s.identity?.supported||!s.version)throw Error('Control requires LIVE context, an enabled bridge and confirmed ArduPilot Copter firmware.');
        if(this.owner&&this.now()-this.owner.lastSeen>=LEASE_MS)this.release('Previous operator lease expired');
        if(this.owner&&this.owner.id!==id)throw Error('Another browser owns control.');
        this.owner={id,lastSeen:this.now()};this.status(id,'CONFIRMED','Exclusive control acquired. Operator heartbeat monitoring is now active.',{command:'CLAIM_CONTROL'});return;
      }
      if(msg.type==='REFRESH_SAFETY') {if(this.now()-(c.lastRefresh??-Infinity)>2000){this.readQueue=[...PARAMETER_NAMES];this.lastDiscovery=-Infinity;c.lastRefresh=this.now();}return;}
      const s=this.guard(id,msg);
      if(typeof msg.requestId!=='string'||msg.requestId.length>100||!msg.requestId)throw Error('A unique request ID is required.');
      if(c.seenIds.has(msg.requestId))throw Error('Duplicate request; command was not replayed.');
      c.seenIds.add(msg.requestId);if(c.seenIds.size>256)c.seenIds.delete(c.seenIds.values().next().value);
      if(this.pending||this.transaction)throw Error('Another command or parameter transaction is in progress.');
      if(msg.type==='PREVIEW_SAFETY') {c.preview=buildSafetyPreview(this.vehicle,msg.values);this.emit(id,{type:'SAFETY_PREVIEW',preview:c.preview});return;}
      if(msg.type==='APPLY_SAFETY') {
        const p=c.preview;
        if(!p||p.id!==msg.previewId||p.sessionId!==s.sessionId||this.now()-p.createdAt>30000)throw Error('Preview expired. Create a new preview.');
        if(s.heartbeat.isArmed!==false)throw Error('Safety configuration requires disarmed state.');
        c.preview=null;
        this.transaction={client:id,preview:p,phase:'precheck',index:0,results:[],deadline:0,retries:0,checks:[...p.changes.map(x=>({name:x.name,value:x.before,type:x.type})),...p.guards]};
        this.advanceTransaction();return;
      }
      this.startCommand(id,msg,s);
    }catch(error){this.status(id,'REJECTED',error.message,{command:typeof msg?.type==='string'?msg.type:'UNKNOWN',requestId:msg?.requestId});}
  }
  startCommand(id,msg,s) {
    const meta={command:msg.type,requestId:msg.requestId,label:msg.type};let p;
    if(s.heartbeat.systemStatus>=5)throw Error('Autopilot reports a critical or emergency state. Respect the onboard failsafe and pilot controls.');
    const rtl=msg.type==='RTL'||(msg.type==='SET_MODE'&&msg.mode==='RTL');
    if(rtl) {
      if(msg.confirm!==true)throw Error('Confirm RTL explicitly.');
      if(!this.snapshot(id).home||!s.positionValid||!s.heartbeat.isArmed)throw Error('RTL requires armed state, confirmed home and healthy fresh GPS/EKF position.');
      if(s.heartbeat.flightMode==='RTL'){this.status(id,'RTL_ACTIVE','RTL already active; no new command sent.',{...meta,label:'RTL'});return;}
      p={command:176,fields:{command:176,param1:1,param2:MODES.RTL},goal:'RTL',meta:{...meta,label:'RTL'}};
    } else if(msg.type==='SET_MODE') {
      if(!Object.hasOwn(MODES,msg.mode))throw Error('Unsupported flight mode.');
      if(['LOITER','GUIDED'].includes(msg.mode)&&!s.positionValid)throw Error('Fresh healthy navigation required for this mode.');
      if(s.heartbeat.flightMode===msg.mode){this.status(id,'CONFIRMED',`${msg.mode} already observed.`,{...meta,label:msg.mode});return;}
      p={command:176,fields:{command:176,param1:1,param2:MODES[msg.mode]},mode:msg.mode,meta:{...meta,label:msg.mode}};
    } else if(msg.type==='COMMAND_LONG') {
      const params=msg.params;
      if(!Array.isArray(params)||params.length!==7||!params.every(Number.isFinite))throw Error('Exactly seven finite parameters are required.');
      if(msg.command===400) {
        if(![0,1].includes(params[0])||params.slice(1).some(v=>v!==0))throw Error('Only ordinary arm/disarm is allowed; force flags are forbidden.');
        if(params[0]===0&&s.landed?.state!==1)throw Error('Disarm requires fresh landed confirmation.');
        p={command:400,fields:{command:400,param1:params[0]},arm:params[0]===1,meta:{...meta,label:params[0]?'ARM':'DISARM'}};
      }else if(msg.command===22) {
        if(!s.heartbeat.isArmed||s.heartbeat.flightMode!=='GUIDED'||!s.positionValid||!this.snapshot(id).home||params.slice(0,6).some(v=>v!==0)||params[6]<2||params[6]>100)throw Error('Takeoff requires armed GUIDED, home, navigation and an altitude of 2-100 m.');
        p={command:22,fields:{command:22,param7:params[6]},takeoff:true,startAltitude:s.position.relativeAltitude,meta:{...meta,label:'TAKEOFF'}};
      }else throw Error('Command not on allowlist.');
    }else throw Error('Unsupported control operation.');
    this.pending={...p,initialMode:s.heartbeat.flightMode,initialArmed:s.heartbeat.isArmed,client:id,started:this.now(),lastSent:this.now(),attempts:1,accepted:false};
    try{this.transmit('COMMAND_LONG',p.fields);}catch(e){this.pending=null;throw e;}
    this.status(id,'SUBMITTED',`${p.meta.label} request sent; awaiting autopilot.`,p.meta);
  }
  transactionAllowed() {const t=this.transaction;return t&&this.owner?.id===t.client&&this.now()-this.owner.lastSeen<LEASE_MS&&this.vehicle.fresh('heartbeat')&&this.vehicle.value('heartbeat')?.isArmed===false&&this.vehicle.sessionId===t.preview.sessionId;}
  abortTransaction(reason) {
    const t=this.transaction;if(!t)return;this.transaction=null;this.configurationUncertain=true;
    const results=t.preview.changes.map(item=>{
      const previous=t.results.find(r=>r.name===item.name);
      if(item.name===t.current?.name && t.phase!=='precheck')return {name:item.name,status:'UNVERIFIED',value:item.value};
      return previous??{name:item.name,status:'NOT_ATTEMPTED',value:item.value};
    });
    this.emit(t.client,{type:'SAFETY_RESULT',status:'PARTIAL_FAILURE',message:reason+' Existing successful changes remain; refresh and review before flight.',results});
    this.log({status:'PARTIAL_FAILURE',message:reason});
  }
  advanceTransaction() {
    const t=this.transaction;if(!t)return;
    if(!this.transactionAllowed()){this.abortTransaction('Control/link/disarmed state changed');return;}
    if(t.phase==='precheck'&&t.index>=t.checks.length){t.phase='write';t.index=0;}
    if(t.phase==='write'&&t.index>=t.preview.changes.length){t.phase='final';t.index=0;}
    if(t.phase==='final'&&t.index>=t.preview.changes.length) {
      this.warning=t.preview.warning;this.configurationUncertain=false;this.transaction=null;
      this.emit(t.client,{type:'SAFETY_RESULT',status:'VERIFIED',message:'All requested parameters read back. Active protection still requires home, navigation and onboard fence health.',results:t.results});return;
    }
    const item=t.phase==='precheck'?t.checks[t.index]:t.preview.changes[t.index];
    t.current=item;t.deadline=this.now()+1500;t.retries=0;
    if(t.phase==='write' && item.before===item.value) {
      t.phase='readback';t.results.push({name:item.name,status:'CHECKING',value:item.value});this.readParameter(item.name);
    } else if(t.phase==='write') {
      t.phase='echo';t.results.push({name:item.name,status:'SENT',value:item.value});
      this.transmit('PARAM_SET',{param_id:item.name,param_value:item.value,param_type:item.type});
    }else this.readParameter(item.name);
  }
  handleParameter(f) {
    const t=this.transaction;if(!t||t.current?.name!==f.param_id)return;
    if(!this.transactionAllowed()){this.abortTransaction('Aircraft armed or control lost during configuration');return;}
    if(!Number.isFinite(f.param_value)||Math.abs(f.param_value-t.current.value)>Math.max(1e-4,Math.abs(t.current.value)*1e-6)){this.abortTransaction(`${f.param_id} did not match the ${t.phase==='precheck'?'preview baseline':'requested value'}`);return;}
    if(t.current.type!==undefined && f.param_type!==t.current.type){this.abortTransaction(`${f.param_id} type changed`);return;}
    if(t.phase==='echo'){t.phase='readback';t.deadline=this.now()+1500;t.retries=0;this.readParameter(f.param_id);return;}
    if(t.phase==='readback'){t.results[t.results.length-1].status='VERIFIED';t.phase='write';}
    t.index++;this.advanceTransaction();
  }
  tick() {
    this.synchronizeEpoch();
    if(this.owner&&(this.now()-this.owner.lastSeen>=LEASE_MS||!this.vehicle.fresh('heartbeat')))this.release('Operator lease or aircraft heartbeat expired');
    if(this.owner&&this.now()-this.lastHeartbeat>=1000) {
      this.transmit('HEARTBEAT',{type:6,autopilot:8,base_mode:0,custom_mode:0,system_status:4,mavlink_version:3});this.lastHeartbeat=this.now();
    }
    if(this.vehicle.fresh('heartbeat') && this.vehicle.identity?.supported && Array.from(this.clients.values()).some(c=>c.mode==='LIVE')) {
      if(this.now()-this.lastDiscovery>=10000) {
        this.requestMessage(242); if(!this.vehicle.value('version'))this.requestMessage(148);
        this.lastDiscovery=this.now();
      }
      // Request a missing stream at a bounded rate. Never reconfigure persistent SR parameters.
      const streams={position:[33,5],attitude:[30,5],gps:[24,2],ekf:[193,2],battery:[1,1],landed:[245,1],fence:[162,1]};
      this.lastStreamRequest??={};
      for(const [key,[id,hz]] of Object.entries(streams)) {
        if(!this.vehicle.fresh(key)&&this.now()-(this.lastStreamRequest[key]??-Infinity)>=10000){
          this.transmit('COMMAND_LONG',{command:511,param1:id,param2:1000000/hz});this.lastStreamRequest[key]=this.now();
        }
      }
      if(!this.vehicle.value('home')&&this.now()-(this.lastHomeRequest??-Infinity)>=1000){this.requestMessage(242);this.lastHomeRequest=this.now();}
      if(this.now()-this.lastPoll>=25000&&!this.transaction){this.readQueue=[...PARAMETER_NAMES];this.lastPoll=this.now();}
      if(this.readQueue.length&&!this.transaction&&this.now()-this.lastRead>=100){this.readParameter(this.readQueue.shift());this.lastRead=this.now();}
    }
    const p=this.pending;
    if(p) {
      if(this.now()-p.started>=COMMAND_MS){this.status(p.client,'TIMEOUT','Command outcome not confirmed. Inspect aircraft state before retrying.',p.meta);this.pending=null;}
      else if(!p.accepted && p.goal==='RTL' && this.vehicle.snapshot().positionValid && this.vehicle.value('home') && this.vehicle.value('heartbeat')?.flightMode===p.initialMode && this.vehicle.value('heartbeat')?.isArmed===p.initialArmed && this.now()-p.lastSent>=ACK_MS && p.attempts<2) {
        // Stop retransmitting once another observed mode/arming transition occurs.
        this.transmit('COMMAND_LONG',{...p.fields,confirmation:p.attempts});p.attempts++;p.lastSent=this.now();
      }
    }
    const t=this.transaction;
    if(t&&!this.transactionAllowed())this.abortTransaction('Aircraft armed or control/link lost');
    else if(t&&this.now()>t.deadline) {
      // Never retry a write blindly: request current value and require a match.
      if(t.phase==='echo'){t.phase='readback';this.readParameter(t.current.name);t.deadline=this.now()+1500;}
      else if(t.retries++<1){this.readParameter(t.current.name);t.deadline=this.now()+1500;}
      else this.abortTransaction(`Timeout reading ${t.current.name}`);
    }
    const s=this.vehicle.snapshot(), safety=safetySummary(this.vehicle);
    this.warningState=distanceWarning(this.warningState,s.guidance?.distance,this.warning,safety.radius);
  }
  snapshot(client) {
    const state=this.vehicle.snapshot(), safety=safetySummary(this.vehicle);
    const joined=this.clients.get(client)?.homeRevision;
    if(joined!=null && this.vehicle.homeRevision<=joined){
      state.home=null;state.guidance=null;if(safety.status==='ACTIVE')safety.status='AWAITING_HOME';
    }
    if(this.transaction)safety.status='VERIFYING';
    if(this.configurationUncertain)safety.status='REQUIRES_REVIEW';
    return {type:'GCS_STATE',...state,safety:{...safety,warningThreshold:this.warning,warningState:this.warningState,applying:!!this.transaction},control:{enabled:this.allowControl,owner:!!this.owner,owned:this.owner?.id===client,context:this.clients.get(client)?.mode??'OBSERVE',leaseMs:LEASE_MS},pending:this.pending?{...this.pending.meta,accepted:this.pending.accepted}:null,audit:this.audit};
  }
}
