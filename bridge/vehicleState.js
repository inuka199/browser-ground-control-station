import { randomUUID } from 'node:crypto';
import { homeVector, validCoordinate, wrap360 } from '../shared/homeGuidance.js';

export const MODES = { STABILIZE:0, ALT_HOLD:2, GUIDED:4, LOITER:5, RTL:6, LAND:9 };
const MODE_NAMES = { 0:'STABILIZE', 1:'ACRO', 2:'ALT_HOLD', 3:'AUTO', 4:'GUIDED', 5:'LOITER', 6:'RTL', 9:'LAND', 16:'POSHOLD', 21:'SMART_RTL' };
export const TTL = { heartbeat:3000, position:2000, attitude:2000, gps:3000, ekf:3000, battery:5000, home:30000, landed:3000, fence:5000, version:Infinity };
const COPTERS = [2,3,13,14,15,29,35];
const EKF_REQUIRED = 1 | 16 | 32; // attitude and absolute horizontal / vertical position
const EKF_INVALID = 128 | 1024 | 32768; // constant position, uninitialised or GPS glitch
export class VehicleState {
  constructor({ now=()=>performance.now(), systemId=null }={}) {
    this.now=now; this.configuredSystem=systemId; this.identity=null; this.endpoint=null; this.homeRevision=0; this.reset('Waiting for autopilot heartbeat');
  }
  reset(reason) {
    this.sessionId=randomUUID(); this.samples={}; this.parameters=new Map(); this.bootTimes={}; this.warnings=[]; this.returnState='IDLE'; this.returnHome=null; this.reason=reason; this.epoch=(this.epoch||0)+1;
  }
  sample(name, value) { this.samples[name]={value,at:this.now()}; }
  age(name) { const s=this.samples[name]; return s?Math.max(0,this.now()-s.at):null; }
  fresh(name) { const age=this.age(name); return age!==null&&age<TTL[name]; }
  value(name) { return this.fresh(name)?this.samples[name]?.value:null; }
  ingest(message, endpoint) {
    const {name,system,component,fields:f}=message;
    if(!Number.isInteger(system)||system<1||system>254||component!==1) return false;
    if(this.configuredSystem!==null&&system!==this.configuredSystem) return false;
    if(this.identity && name==='HEARTBEAT' && !this.fresh('heartbeat') && (system!==this.identity.systemId || endpoint?.address!==this.endpoint?.address || endpoint?.port!==this.endpoint?.port)) {
      this.identity=null;this.endpoint=null;this.reset('Aircraft or router changed');
    }
    if(!this.identity) {
      if(name!=='HEARTBEAT'||f.type===6||f.autopilot===8) return false;
      this.identity={systemId:system,componentId:component,autopilot:f.autopilot,vehicleType:f.type,supported:f.autopilot===3&&COPTERS.includes(f.type)};
      this.endpoint=endpoint;
    }
    if(system!==this.identity.systemId||component!==this.identity.componentId) return false;
    if(endpoint && this.endpoint && (endpoint.address!==this.endpoint.address||endpoint.port!==this.endpoint.port)) return false;
    if(name==='HEARTBEAT') {
      if(this.samples.heartbeat&&!this.fresh('heartbeat')) this.reset('Aircraft link reacquired; revalidating home and configuration');
      if(f.type!==this.identity.vehicleType||f.autopilot!==this.identity.autopilot) {
        this.reset('Vehicle identity changed'); this.identity={...this.identity,vehicleType:f.type,autopilot:f.autopilot,supported:f.autopilot===3&&COPTERS.includes(f.type)};
      }
      const previous=this.samples.heartbeat?.value;
      const armed=!!(f.base_mode&128);
      if(previous && armed && !previous.isArmed) { this.returnState='IDLE'; this.returnHome=null; }
      if(previous&&armed!==previous.isArmed) { delete this.samples.home; this.reason='Arming state changed; requesting home'; }
      this.sample('heartbeat',{isArmed:armed,flightMode:this.identity.supported?(MODE_NAMES[f.custom_mode]||`MODE_${f.custom_mode}`):`UNSUPPORTED_${f.custom_mode}`,customMode:f.custom_mode,systemStatus:f.system_status});
      if(this.identity.supported&&f.custom_mode===6&&armed) {
        if(this.returnState!=='RTL_ACTIVE') this.returnHome=null;
        this.returnState='RTL_ACTIVE';
      } else if(this.returnState==='RTL_ACTIVE') {
        this.returnState=armed?'INTERRUPTED':'DISARMED_RETURN_UNCONFIRMED';
      }
    } else {
      if(!this.fresh('heartbeat')) return false;
      if(Number.isInteger(f.time_boot_ms)) {
        const old=this.bootTimes[name];
        if(old===f.time_boot_ms)return false; // Duplicate source sample cannot refresh sensor age.
        if(old!==undefined&&f.time_boot_ms<old) {
          if(old-f.time_boot_ms>1000&&!(old>0xffff0000&&f.time_boot_ms<60000)) { this.reset('Autopilot clock restarted; awaiting heartbeat'); return false; }
          if(!(old>0xffff0000&&f.time_boot_ms<60000))return false; // reordered packet
        }
        this.bootTimes[name]=f.time_boot_ms;
      }
      switch(name) {
        case 'GLOBAL_POSITION_INT': {
          const p={latitude:f.lat/1e7,longitude:f.lon/1e7,altitude:f.alt/1000,relativeAltitude:f.relative_alt/1000,groundSpeed:Math.hypot(f.vx,f.vy)/100,heading:f.hdg>=0&&f.hdg<36000?f.hdg/100:null};
          if(Number.isFinite(p.altitude)&&Number.isFinite(p.groundSpeed)&&validCoordinate(p)&&Number.isFinite(p.relativeAltitude)&&Math.abs(p.relativeAltitude)<100000) this.sample('position',p); else delete this.samples.position;
          break;
        }
        case 'ATTITUDE':
          if([f.roll,f.pitch,f.yaw].every(Number.isFinite)) this.sample('attitude',{roll:f.roll*180/Math.PI,pitch:f.pitch*180/Math.PI,yaw:wrap360(f.yaw*180/Math.PI)}); else delete this.samples.attitude;
          break;
        case 'HOME_POSITION': {
          const p={latitude:f.latitude/1e7,longitude:f.longitude/1e7,altitude:f.altitude/1000};
          if(validCoordinate(p)&&Number.isFinite(p.altitude)) {
            this.sample('home',{...p,source:'HOME_POSITION',sessionId:this.sessionId});
            this.homeRevision++;
          } else delete this.samples.home;
          break;
        }
        case 'GPS_RAW_INT': this.sample('gps',{fixType:f.fix_type,satellites:f.satellites_visible===255?null:f.satellites_visible,hdop:f.eph===65535?null:f.eph/100}); break;
        case 'EKF_STATUS_REPORT': this.sample('ekf',{flags:f.flags,healthy:(f.flags&EKF_REQUIRED)===EKF_REQUIRED&&(f.flags&EKF_INVALID)===0}); break;
        case 'SYS_STATUS': this.sample('battery',{voltage:f.voltage_battery<65535?f.voltage_battery/1000:null,remaining:f.battery_remaining>=0&&f.battery_remaining<=100?f.battery_remaining:null,sensorsPresent:f.onboard_control_sensors_present,sensorsEnabled:f.onboard_control_sensors_enabled,sensorsHealthy:f.onboard_control_sensors_health}); break;
        case 'AUTOPILOT_VERSION': {
          const version=`${f.flight_sw_version>>>24}.${(f.flight_sw_version>>>16)&255}.${(f.flight_sw_version>>>8)&255}`;
          const previous=this.samples.version?.value;
          if(previous&&(previous.uid!==f.uid||previous.version!==version||previous.releaseType!==(f.flight_sw_version&255))) { this.reset('Autopilot firmware/identity changed; awaiting heartbeat'); return false; }
          this.sample('version',{version,releaseType:f.flight_sw_version&255,capabilities:f.capabilities,uid:f.uid}); break;
        }
        case 'PARAM_VALUE': if(/^[A-Z][A-Z0-9_]{0,15}$/.test(f.param_id)&&Number.isFinite(f.param_value)) this.parameters.set(f.param_id,{value:f.param_value,type:f.param_type,at:this.now(),sessionId:this.sessionId}); break;
        case 'FENCE_STATUS': this.sample('fence',{breached:f.breach_status===1,count:f.breach_count,type:f.breach_type}); break;
        case 'EXTENDED_SYS_STATE': this.sample('landed',{state:f.landed_state}); break;
        case 'STATUSTEXT': this.warnings=[...this.warnings.slice(-19),{text:f.text,severity:f.severity,at:this.now(),chunk:f.chunk_seq}]; break;
      }
    }
    const home=this.value('home');
    if(this.returnState==='RTL_ACTIVE' && !this.returnHome && home) this.returnHome=home;
    if(this.returnState==='DISARMED_RETURN_UNCONFIRMED' && this.returnHome && home &&
      home.latitude===this.returnHome.latitude && home.longitude===this.returnHome.longitude &&
      this.value('landed')?.state===1 && this.value('gps')?.fixType>=3 && this.value('ekf')?.healthy &&
      homeVector(this.value('position'),this.returnHome)?.distance<5) this.returnState='RETURN_COMPLETED';
    return true;
  }
  snapshot() {
    const heartbeat=this.value('heartbeat'), position=heartbeat?this.value('position'):null, attitude=heartbeat?this.value('attitude'):null;
    const home=heartbeat?this.value('home'):null, gps=this.value('gps'), ekf=this.value('ekf'), battery=heartbeat?this.value('battery'):null;
    const positionValid=!!position&&!!gps&&gps.fixType>=3&&gps.fixType<=8&&ekf?.healthy===true;
    const heading=attitude?.yaw??position?.heading??null;
    return {sessionId:this.sessionId,identity:this.identity,version:this.value('version'),link:{aircraft:!!heartbeat,ages:Object.fromEntries(Object.keys(TTL).map(k=>[k,this.age(k)]))},heartbeat,position,attitude,heading,home,gps,ekf,battery,positionValid,
      guidance:positionValid&&home?homeVector(position,home,heading):null,fence:this.value('fence'),landed:this.value('landed'),returnState:heartbeat?this.returnState:'UNKNOWN',reason:this.reason,warnings:this.warnings,
      parameters:Object.fromEntries([...this.parameters].map(([k,v])=>[k,{...v,age:Math.max(0,this.now()-v.at)}]))};
  }
}
