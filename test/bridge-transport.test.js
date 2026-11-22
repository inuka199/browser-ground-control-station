import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter,once} from 'node:events';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import dgram from 'node:dgram';
import {WebSocket} from 'ws';
import {startBridge} from '../bridge.js';
import {encode,decodeDatagram} from '../bridge/protocol.js';

function until(ws,predicate) {
  return new Promise((resolve,reject)=>{
    function receive(raw){const m=JSON.parse(raw);if(predicate(m)){clearTimeout(timer);ws.off('message',receive);resolve(m);}}
    const timer=setTimeout(()=>{ws.off('message',receive);reject(Error('Timed out waiting for bridge event'));},4000);
    ws.on('message',receive);
  });
}
test('isolated bridge transport enforces authentication, read-only observers, one controller, and releases control on socket close',async t=>{
  const token='loopback-integration-test-fixture';
  const native=process.env.GCS_TEST_NETWORK==='1',wire=[];
  const localPipe=native?undefined:process.platform==='win32'?String.raw`\\.\pipe\gcs-`+process.pid:path.join(os.tmpdir(),'gcs-'+process.pid+'.sock');
  const fake=Object.assign(new EventEmitter(),{
    bind(){queueMicrotask(()=>this.emit('listening'));},close(){},address(){return {port:12000};},
    send(buf,_port,_host,callback){wire.push(...decodeDatagram(buf));callback();}
  });
  const b=startBridge({UDP_HOST:'127.0.0.1',WS_HOST:'127.0.0.1',UDP_PORT:'0',WS_PORT:'0',GCS_TOKEN:token,GCS_ALLOW_CONTROL:'1',DRONE_SYSTEM_ID:'42'},{localPipe,udpSocket:native?undefined:fake});
  const fixture=native?dgram.createSocket('udp4'):Object.assign(new EventEmitter(),{send(buf){fake.emit('message',buf,{address:'127.0.0.1',port:13000});},close(){}});
  fixture.on('message',buf=>wire.push(...decodeDatagram(buf)));t.after(()=>{fixture.close();b.close();});
  await Promise.all([once(b.udp,'listening'),once(b.server,'listening')]);
  const options={origin:'http://localhost:5173',...(localPipe?{createConnection:()=>net.connect(localPipe)}:{})};
  const base='ws://127.0.0.1:'+(native?b.server.address().port:8080);
  async function open(path) {
    const ws=new WebSocket(base+path,options);t.after(()=>ws.terminate());
    await until(ws,m=>m.type==='AUTH_REQUIRED');const ready=until(ws,m=>m.type==='GCS_STATE');
    ws.send(JSON.stringify({type:'AUTH',token}));await ready;return ws;
  }
  const bad=new WebSocket(base+'/live',options);
  await until(bad,m=>m.type==='AUTH_REQUIRED');const closed=once(bad,'close');bad.send(JSON.stringify({type:'AUTH',token:'wrong'}));assert.equal((await closed)[0],1008);
  const pilot=await open('/live'),observer=await open('/observe'),other=await open('/live');
  const state=until(pilot,m=>m.type==='GCS_STATE'&&m.home&&m.version);
  const packets=[['HEARTBEAT',{type:2,autopilot:3,base_mode:1,custom_mode:5,system_status:3,mavlink_version:3}],['AUTOPILOT_VERSION',{flight_sw_version:0x040507ff}],['HOME_POSITION',{latitude:60000000,longitude:790000000}]];
  fixture.send(Buffer.concat(packets.map(([n,v],i)=>encode(n,v,{system:42,component:1,sequence:i}))),b.udp.address().port,'127.0.0.1');
  const frame=await state;assert.equal(frame.home.latitude,6);
  const command={type:'CLAIM_CONTROL',context:'LIVE',sessionId:frame.sessionId};
  async function request(ws,data,status){const event=until(ws,m=>m.type==='COMMAND_STATUS'&&m.status===status);ws.send(JSON.stringify(data));return event;}
  await request(observer,command,'REJECTED');await request(pilot,command,'CONFIRMED');await request(other,command,'REJECTED');
  await request(pilot,{type:'SET_MODE',context:'LIVE',sessionId:frame.sessionId,requestId:'mode-1',mode:'ALT_HOLD'},'SUBMITTED');
  const released=until(other,m=>m.type==='GCS_STATE'&&!m.control.owner);pilot.close();await released;
  assert.equal(wire.filter(m=>m.fields.command===176).length,1);
  assert.ok(wire.some(m=>m.fields.command===512&&m.fields.param1===242));
  assert.equal(b.engine.pending,null);const count=wire.filter(m=>m.name==='HEARTBEAT').length;
  await new Promise(r=>setTimeout(r,1100));assert.equal(wire.filter(m=>m.name==='HEARTBEAT').length,count);
});

