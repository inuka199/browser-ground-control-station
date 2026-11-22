import { randomUUID } from 'node:crypto';
// Exact released firmware only. New/renamed parameters must get a separately
// reviewed profile; an unknown build remains readable but cannot be configured.
export const PARAMETER_SOURCE='https://ardupilot.org/copter/docs/parameters-Copter-stable-V4.5.7.html';
export const PARAMETER_NAMES=['FENCE_ENABLE','FENCE_TYPE','FENCE_ACTION','FENCE_RADIUS','FENCE_ALT_MAX','FENCE_MARGIN','RTL_ALT','RTL_ALT_FINAL','RTL_ALT_TYPE','RTL_CLIMB_MIN','RTL_CONE_SLOPE','RTL_LOIT_TIME','FS_THR_ENABLE','FS_GCS_ENABLE','FS_GCS_TIMEOUT','FS_OPTIONS','SYSID_MYGCS','BATT_FS_LOW_ACT','BATT_FS_CRT_ACT','BATT_LOW_VOLT','BATT_CRT_VOLT','BATT_LOW_MAH','BATT_CRT_MAH','RALLY_TOTAL','FENCE_RET_RALLY','FENCE_AUTOENABLE','ARMING_CHECK','FS_EKF_ACTION','FENCE_ALT_MAX_TP','RTL_ALT_M','RTL_ALT_FINAL_M'];
const minRtlHeight = new Map([['4.5.7',2],['4.6.3',0.3]]);
export function profileFor(firmware) {
  if(firmware?.releaseType!==255 || !minRtlHeight.has(firmware.version))return null;
  return {version:firmware.version,source:PARAMETER_SOURCE.replace('4.5.7',firmware.version),altitudeFrame:'Above home',minRtlAltitude:minRtlHeight.get(firmware.version),rtlScale:100};
}
export function freshParameter(vehicle,name) { const p=vehicle.parameters.get(name); return p&&p.sessionId===vehicle.sessionId&&vehicle.now()-p.at<45000?p:null; }
export function safetySummary(vehicle) {
  const p=name=>freshParameter(vehicle,name)?.value;
  const profile=profileFor(vehicle.value('version'));
  const complete=['FENCE_ENABLE','FENCE_TYPE','FENCE_ACTION','FENCE_RADIUS','FENCE_ALT_MAX','FENCE_MARGIN','RTL_ALT','RTL_ALT_FINAL','RTL_ALT_TYPE'].every(name=>p(name)!==undefined);
  const configured=!!profile&&complete&&p('FENCE_ENABLE')===1&&(p('FENCE_TYPE')&3)===3&&[1,3].includes(p('FENCE_ACTION'))&&p('FENCE_RADIUS')>=30&&p('FENCE_RADIUS')>p('FENCE_MARGIN')&&p('FENCE_ALT_MAX')>=10;
  const state=vehicle.snapshot();
  // FENCE SYS_STATUS bit proves the autopilot currently reports the fence enabled/healthy.
  const mask=1<<20, sensor=state.battery;
  const running=!!sensor&&(sensor.sensorsPresent&mask)!==0&&(sensor.sensorsEnabled&mask)!==0&&(sensor.sensorsHealthy&mask)!==0;
  return {profile,configured,status:!state.link.aircraft?'UNKNOWN':configured&&state.home&&state.positionValid&&running?'ACTIVE':configured?'CONFIGURED_NOT_ACTIVE':'UNVERIFIED',radius:p('FENCE_RADIUS')??null,altitude:p('FENCE_ALT_MAX')??null,altitudeFrame:profile?.altitudeFrame??'Unknown; check firmware',rallyPossible:p('RALLY_TOTAL')===undefined||p('RALLY_TOTAL')>0};
}
export function buildSafetyPreview(vehicle,values) {
  const profile=profileFor(vehicle.value('version'));
  if(!profile) throw Error('No reviewed safety parameter profile for this exact firmware release. Configuration is read-only.');
  if(!vehicle.identity?.supported||!vehicle.fresh('heartbeat')||vehicle.value('heartbeat')?.isArmed!==false) throw Error('A supported, freshly confirmed disarmed aircraft is required.');
  for(const key of ['radius','warning','altitude','rtlAltitude','finalAltitude']) if(typeof values?.[key]!=='number'||!Number.isFinite(values[key])) throw Error(`Choose a finite ${key} value.`);
  if(values.radius<30||values.radius>10000||values.warning<=0||values.warning>=values.radius-5) throw Error('Radius must be 30–10000 m; warning must be at least 5 m inside it.');
  if(values.altitude<10||values.altitude>1000||values.rtlAltitude<profile.minRtlAltitude||values.rtlAltitude>=values.altitude||values.finalAltitude<0||values.finalAltitude>10||values.finalAltitude>values.rtlAltitude) throw Error('Invalid altitude relationship: fence > RTL >= final; review clearance before applying.');
  const get=name=>{const p=freshParameter(vehicle,name); if(!p)throw Error(`Missing/stale ${name}; refresh parameters.`); return p;};
  const type=get('FENCE_TYPE');
  if(!Number.isInteger(type.value)||type.value<0||type.value>15) throw Error('Unsupported fence bitmask.');
  if(values.radius<=get('FENCE_MARGIN').value) throw Error('Radius must exceed the existing fence margin.');
  if(get('RTL_ALT_TYPE').value!==0) throw Error('Terrain-referenced RTL needs separate review. This editor supports above-home RTL only.');
  const desired={FENCE_RADIUS:values.radius,FENCE_ALT_MAX:values.altitude,RTL_ALT:Math.round(values.rtlAltitude*100),RTL_ALT_FINAL:Math.round(values.finalAltitude*100),FENCE_ACTION:1,FENCE_TYPE:type.value|3,FENCE_ENABLE:1};
  const changes=Object.entries(desired).map(([name,value])=>{const current=get(name);if(![1,2,3,4,5,6,9].includes(current.type))throw Error(`Unsupported parameter encoding for ${name}`);return {name,before:current.value,value:Math.fround(value),type:current.type,unit:name.startsWith('RTL_ALT')?'cm':['FENCE_RADIUS','FENCE_ALT_MAX'].includes(name)?'m':'enum / bitmask'};});
  return {id:randomUUID(),sessionId:vehicle.sessionId,createdAt:vehicle.now(),profile,warning:values.warning,changes,guards:['FENCE_MARGIN','RTL_ALT_TYPE'].map(name=>({name,value:get(name).value})),notes:['RTL/LAND action: RTL may fall back to LAND when navigation is unavailable.','Existing polygon/minimum-altitude fence bits are preserved.','RC, battery and GCS failsafe settings are displayed but are not changed.','Loiter may stop at the horizontal boundary before a breach occurs.','A straight return path does not establish obstacle clearance.']};
}
