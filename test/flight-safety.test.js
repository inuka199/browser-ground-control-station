import test from 'node:test';
import assert from 'node:assert/strict';
import {ControlEngine} from '../bridge/controlEngine.js';
import {homeVector,distanceWarning} from '../shared/homeGuidance.js';
import {encode,decodeDatagram} from '../bridge/protocol.js';
import {profileFor} from '../bridge/safetyConfig.js';

const settings={FENCE_ENABLE:0,FENCE_TYPE:4,FENCE_ACTION:0,FENCE_RADIUS:300,FENCE_ALT_MAX:120,FENCE_MARGIN:2,RTL_ALT:2500,RTL_ALT_FINAL:0,RTL_ALT_TYPE:0};
const limits={radius:150,warning:120,altitude:80,rtlAltitude:30,finalAltitude:0};
function fixture() {
  let now=1000,request=0;
  const sent=[],events=[],ep={address:'127.0.0.1',port:12345};
  const engine=new ControlEngine({now:()=>now,systemId:42,send:(name,fields)=>sent.push({name,fields}),emit:(id,m)=>events.push({id,...m}),allowControl:true});
  function feed(name,fields,overrides={}){engine.ingest({name,fields,system:42,component:1,...overrides},ep);}
  function hb(armed=false,mode=5){feed('HEARTBEAT',{type:2,autopilot:3,base_mode:armed?129:1,custom_mode:mode,system_status:4});}
  function nav(boot=10000) {
    feed('GLOBAL_POSITION_INT',{time_boot_ms:boot,lat:100000000,lon:100000000,alt:35000,relative_alt:5000,vx:0,vy:0,hdg:35900});
    feed('GPS_RAW_INT',{fix_type:3,satellites_visible:12,eph:100});feed('EKF_STATUS_REPORT',{flags:49});
    feed('HOME_POSITION',{latitude:100010000,longitude:100000000,altitude:30000});
  }
  function param(name,value,type=9){feed('PARAM_VALUE',{param_id:name,param_value:value,param_type:type});}
  function action(type,extra={},id='pilot'){engine.handle(id,{type,context:'LIVE',sessionId:engine.vehicle.sessionId,requestId:String(++request),...extra});}
  function claim(){action('SET_CONTEXT');action('CLAIM_CONTROL');}
  function preview(){action('PREVIEW_SAFETY',{values:limits});return events.at(-1).preview;}
  hb();feed('AUTOPILOT_VERSION',{flight_sw_version:0x040507ff,capabilities:'131072',uid:'1'});
  engine.addClient('pilot');engine.addClient('other');
  return {engine,sent,events,feed,hb,nav,param,action,claim,preview,step:ms=>{now+=ms;},snapshot:()=>engine.snapshot('pilot')};
}
test('home vector crosses the dateline, wraps heading and suppresses near-home direction',()=>{
  const p={latitude:0,longitude:179.999},h={latitude:0,longitude:-179.999};
  const v=homeVector(p,h,359);assert.ok(v.distance>220&&v.distance<224);assert.equal(v.relativeBearing,91);
  assert.equal(homeVector(h,h,30).relativeBearing,null);assert.equal(homeVector(p,h,null).relativeBearing,null);
  assert.equal(homeVector({latitude:400,longitude:0},h),null);
});
test('warnings have hysteresis and never cause outbound flight commands',()=>{
  const f=fixture();f.nav();f.param('FENCE_RADIUS',150);f.engine.warning=90;f.engine.tick();assert.equal(f.snapshot().safety.warningState,'WARNING');
  assert.equal(distanceWarning('WARNING',88,90,150),'WARNING');assert.equal(distanceWarning('WARNING',80,90,150),'NORMAL');
  assert.equal(distanceWarning('NORMAL',151,90,150),'BREACH');assert.equal(distanceWarning('BREACH',148,90,150),'BREACH');
  assert.ok(!f.sent.some(x=>x.name==='COMMAND_LONG'&&x.fields.command===176));
});
test('only authoritative home survives within the current identity and arming epoch',()=>{
  const f=fixture();assert.equal(f.snapshot().home,null);f.nav();assert.ok(f.snapshot().guidance);f.hb(true);assert.equal(f.snapshot().home,null);
  f.feed('HOME_POSITION',{latitude:1,longitude:2,altitude:3},{system:41});assert.equal(f.snapshot().home,null);
  f.nav(11000);const old=f.snapshot().sessionId;f.nav(1000);assert.notEqual(f.snapshot().sessionId,old);assert.equal(f.snapshot().home,null);
  f.hb();assert.equal(f.snapshot().version,null);assert.equal(f.snapshot().guidance,null);
});
test('fresh broadcasts cannot revive stale position or unknown battery, and EKF loss removes guidance',()=>{
  const f=fixture();f.nav();f.feed('SYS_STATUS',{battery_remaining:-1,voltage_battery:65535});assert.equal(f.snapshot().battery.remaining,null);
  for(const invalid of [128,1024,32768]){
    f.feed('EKF_STATUS_REPORT',{flags:49|invalid});assert.equal(f.snapshot().guidance,null);
  }
  f.step(2100);f.hb();f.nav(10000);assert.equal(f.snapshot().position,null);
  f.nav(10001);f.feed('GPS_RAW_INT',{fix_type:1});assert.equal(f.snapshot().guidance,null);
  f.step(3100);assert.equal(f.snapshot().link.aircraft,false);assert.equal(f.snapshot().home,null);
});
test('unsupported vehicle cannot claim, stale link or identity change revokes ownership',()=>{
  const f=fixture();f.claim();assert.equal(f.snapshot().control.owned,true);
  f.feed('HEARTBEAT',{type:1,autopilot:3,base_mode:0,custom_mode:4});assert.equal(f.snapshot().control.owned,false);assert.equal(f.snapshot().identity.supported,false);
  f.action('CLAIM_CONTROL');assert.equal(f.events.at(-1).status,'REJECTED');
});
test('operator heartbeat cannot be supplied by observer or revived after expiration',()=>{
  const f=fixture();f.claim();f.action('SET_CONTEXT',{},'other');f.action('CLAIM_CONTROL',{},'other');assert.equal(f.events.at(-1).status,'REJECTED');
  f.engine.tick();assert.equal(f.sent.filter(x=>x.name==='HEARTBEAT').length,1);
  f.step(3600);f.hb();f.action('OPERATOR_HEARTBEAT');f.engine.tick();assert.equal(f.snapshot().control.owned,false);
  assert.equal(f.sent.filter(x=>x.name==='HEARTBEAT').length,1);
  f.claim();f.engine.removeClient('pilot');f.engine.tick();assert.equal(f.snapshot().control.owner,false);
});
test('manual RTL distinguishes request, ACK, observed mode and landed return',()=>{
  const f=fixture();f.hb(true);f.claim();f.action('RTL',{confirm:true});assert.equal(f.events.at(-1).status,'REJECTED');
  f.nav();f.action('RTL',{confirm:true});assert.equal(f.events.at(-1).status,'SUBMITTED');
  f.feed('COMMAND_ACK',{command:176,result:0,target_system:254});assert.equal(f.events.at(-1).status,'SUBMITTED');
  f.feed('COMMAND_ACK',{command:176,result:0,target_system:255});assert.equal(f.events.at(-1).status,'ACCEPTED');assert.notEqual(f.snapshot().returnState,'RTL_ACTIVE');
  f.hb(true,6);assert.equal(f.events.at(-1).status,'RTL_ACTIVE');assert.notEqual(f.snapshot().returnState,'RETURN_COMPLETED');
  f.hb(false,6);f.feed('EXTENDED_SYS_STATE',{landed_state:1});f.feed('HOME_POSITION',{latitude:100000000,longitude:100000000,altitude:30000});
  assert.equal(f.snapshot().returnState,'DISARMED_RETURN_UNCONFIRMED'); // A new home under the aircraft cannot prove arrival.
  f.feed('HOME_POSITION',{latitude:100010000,longitude:100000000,altitude:30000});
  f.feed('GLOBAL_POSITION_INT',{time_boot_ms:11000,lat:100010000,lon:100000000,alt:30000,relative_alt:0,vx:0,vy:0,hdg:0});
  assert.equal(f.snapshot().returnState,'RETURN_COMPLETED');
});
test('autopilot denial, pilot intervention and timeout stop pending commands',()=>{
  const f=fixture();f.hb(true);f.nav();f.claim();f.action('RTL',{confirm:true});f.feed('COMMAND_ACK',{command:176,result:2});assert.equal(f.events.at(-1).status,'REJECTED');
  f.action('RTL',{confirm:true});f.hb(true,9);assert.equal(f.engine.pending,null);assert.equal(f.events.at(-1).status,'FAILED');
  f.hb(true,5);f.action('RTL',{confirm:true});
  for(let i=1;i<11;i++){f.step(1000);f.hb(true);f.nav(10000+i);f.action('OPERATOR_HEARTBEAT');f.engine.tick();}
  assert.equal(f.events.at(-1).status,'TIMEOUT');assert.equal(f.sent.filter(x=>x.fields.command===176).length,4);
});
test('simulation, replay and ordinary arm command cannot introduce a force flag',()=>{
  const f=fixture();f.claim();f.action('COMMAND_LONG',{command:400,params:[1,21196,0,0,0,0,0]});assert.equal(f.events.at(-1).status,'REJECTED');
  for(const context of ['SIMULATION','REPLAY']){f.action('SET_CONTEXT',{context});f.action('SET_MODE',{mode:'LAND'});assert.equal(f.events.at(-1).status,'REJECTED');}
  assert.ok(!f.sent.some(x=>x.fields.command===400||x.fields.command===176));
});
function prepared() {const f=fixture();f.claim();for(const [key,v] of Object.entries(settings))f.param(key,v);return f;}
test('profile-bound preview preserves other fence bits and verified reads establish configuration',()=>{
  const f=prepared(),p=f.preview();assert.ok(p);assert.equal(p.changes.find(c=>c.name==='FENCE_TYPE').value,7);assert.equal(f.sent.length,0);
  f.action('APPLY_SAFETY',{previewId:p.id});const onboard={...settings};let count=0;
  while(f.engine.transaction&&count<100){const {name,fields}=f.sent[count++];if(name==='PARAM_SET')onboard[fields.param_id]=fields.param_value;f.param(fields.param_id,onboard[fields.param_id]);}
  assert.equal(f.events.at(-1).status,'VERIFIED');assert.ok(f.events.at(-1).results.every(x=>x.status==='VERIFIED'));assert.equal(onboard.RTL_ALT,3000);assert.equal(onboard.FENCE_TYPE,7);
  assert.notEqual(f.snapshot().safety.status,'ACTIVE');f.nav();const bit=1<<20;f.feed('SYS_STATUS',{onboard_control_sensors_present:bit,onboard_control_sensors_enabled:bit,onboard_control_sensors_health:bit,battery_remaining:-1,voltage_battery:65535});
  assert.equal(f.snapshot().safety.status,'ACTIVE');assert.equal(profileFor({version:'4.5.8',releaseType:255}),null);
});
test('changed preview baseline and arming during a transaction halt all writes',()=>{
  const f=prepared();let p=f.preview();f.action('APPLY_SAFETY',{previewId:p.id});f.param('FENCE_RADIUS',180);assert.equal(f.events.at(-1).status,'PARTIAL_FAILURE');
  p=f.preview();f.action('APPLY_SAFETY',{previewId:p.id});f.hb(true);assert.equal(f.engine.transaction,null);assert.ok(!f.sent.some(x=>x.name==='PARAM_SET'));
});
test('MAVLink 1/2 framing and checksum handle truncated home, reject damaged and signed traffic',()=>{
  for(const version of [1,2]){const bytes=encode('HOME_POSITION',{latitude:-350000000,longitude:1490000000,altitude:0},{system:42,component:1,version});
    const [m]=decodeDatagram(bytes);assert.equal(m.fields.latitude,-350000000);assert.equal(m.fields.altitude,0);assert.equal(m.system,42);
    bytes[bytes.length-1]^=1;assert.deepEqual(decodeDatagram(bytes),[]);}
  const packet=encode('HEARTBEAT',{type:2,autopilot:3,mavlink_version:3});packet[2]=1;assert.deepEqual(decodeDatagram(Buffer.concat([packet,Buffer.alloc(13)])),[]);
});

test('simulator and replay observers never trigger discovery or aircraft writes',()=>{
  const f=fixture();f.nav();
  f.action('SET_CONTEXT',{context:'SIMULATION'});
  f.action('SET_CONTEXT',{context:'REPLAY'},'other');
  for(let i=0;i<15;i++){f.step(1000);f.hb();f.engine.tick();}
  assert.deepEqual(f.sent,[]);
});

test('a new browser must receive its own home refresh even within the same clock tick',()=>{
  const f=fixture();f.hb(true);f.nav();
  f.engine.removeClient('pilot');f.engine.addClient('pilot');f.claim();
  assert.equal(f.snapshot().home,null);
  f.action('RTL',{confirm:true});assert.equal(f.events.at(-1).status,'REJECTED');
  f.feed('HOME_POSITION',{latitude:100010000,longitude:100000000,altitude:30000});
  assert.ok(f.snapshot().guidance);
});

test('losing the aircraft link during an unacknowledged RTL prevents replay on reconnect or reboot',()=>{
  const f=fixture();f.hb(true);f.nav();f.claim();f.action('RTL',{confirm:true});
  const epoch=f.snapshot().sessionId;
  f.step(3100);f.engine.tick();assert.equal(f.engine.pending,null);assert.equal(f.snapshot().control.owned,false);
  f.hb(true);assert.notEqual(f.snapshot().sessionId,epoch);assert.equal(f.snapshot().home,null);
  f.nav(12000);f.engine.tick();f.nav(300);f.hb();
  assert.equal(f.snapshot().version,null);assert.equal(f.snapshot().control.owned,false);
  assert.equal(f.sent.filter(x=>x.fields.command===176).length,1);
});

test('a preview expires across arm/disarm and firmware profiles enforce their own RTL minimum',()=>{
  const f=prepared(),p=f.preview();f.hb(true);f.hb(false);
  f.action('APPLY_SAFETY',{previewId:p.id});assert.equal(f.events.at(-1).status,'REJECTED');
  f.action('PREVIEW_SAFETY',{values:{...limits,rtlAltitude:1}});assert.equal(f.events.at(-1).status,'REJECTED');
  assert.equal(profileFor({version:'4.6.3',releaseType:255}).minRtlAltitude,0.3);
  assert.equal(profileFor({version:'4.6.3',releaseType:128}),null);
  assert.ok(!f.sent.some(p=>p.name==='PARAM_SET'));
});

test('a mismatched independent parameter readback leaves the attempted write unverified',()=>{
  const f=prepared(),p=f.preview();
  f.action('APPLY_SAFETY',{previewId:p.id});
  for(const item of [...p.changes,...p.guards])f.param(item.name,settings[item.name]);
  const sent=f.sent.at(-1);assert.equal(sent.name,'PARAM_SET');
  const key=sent.fields.param_id;
  f.param(key,sent.fields.param_value);
  assert.equal(f.sent.at(-1).name,'PARAM_REQUEST_READ');
  f.param(key,settings[key]);
  const outcome=f.events.at(-1);
  assert.equal(outcome.status,'PARTIAL_FAILURE');
  assert.deepEqual(outcome.results.map(r=>r.status),p.changes.map((_,i)=>i===0?'UNVERIFIED':'NOT_ATTEMPTED'));
  assert.equal(f.snapshot().safety.status,'REQUIRES_REVIEW');
  assert.equal(f.sent.filter(m=>m.name==='PARAM_SET').length,1);
});

test('a boundary stop in LOITER is a warning, and an onboard breach is distinct from a calculated distance',()=>{
  const f=fixture();f.hb(true);f.nav();f.param('FENCE_RADIUS',150);f.engine.warning=100;
  const atDistance=(metres,time)=>f.feed('GLOBAL_POSITION_INT',{time_boot_ms:time,lat:100010000+Math.round(metres/111195*1e7),lon:100000000,alt:35000,relative_alt:5000,vx:0,vy:0,hdg:0});
  atDistance(146,11000);f.engine.tick();
  assert.equal(f.snapshot().safety.warningState,'WARNING');assert.equal(f.snapshot().heartbeat.flightMode,'LOITER');assert.equal(f.snapshot().fence,null);
  atDistance(151,12000);f.engine.tick();assert.equal(f.snapshot().safety.warningState,'BREACH');
  f.feed('FENCE_STATUS',{breach_status:1,breach_count:1,breach_type:3});f.hb(true,6);
  assert.equal(f.snapshot().returnState,'RTL_ACTIVE');assert.equal(f.snapshot().fence.breached,true);
  atDistance(10,13000);f.engine.tick();assert.equal(f.snapshot().safety.warningState,'NORMAL');
  assert.equal(f.snapshot().returnState,'RTL_ACTIVE');assert.ok(!f.sent.some(x=>x.fields.command===176));
});

