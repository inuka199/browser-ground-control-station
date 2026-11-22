// @vitest-environment node
import { expect,it } from 'vitest';
import { VehicleState } from '../../../bridge/vehicleState.js';
const ep={address:'127.0.0.1',port:12000};
const position={lat:69271000,lon:798430000,alt:35000,relative_alt:25000,vx:0,vy:0,hdg:65535,time_boot_ms:1000};
const identity={type:2,autopilot:3,base_mode:1,custom_mode:4,system_status:4};
it('pins the autopilot before accepting any position and preserves independent ages on repeated snapshots',()=>{
 let now=50;const v=new VehicleState({now:()=>now});
 const feed=(name,fields,system=42)=>v.ingest({name,fields,system,component:1},ep);
 feed('GLOBAL_POSITION_INT',position);expect(v.snapshot().position).toBeNull();
 feed('HEARTBEAT',identity);feed('GLOBAL_POSITION_INT',position);now+=800;feed('ATTITUDE',{roll:0,pitch:0,yaw:1.57,time_boot_ms:1800});
 feed('GLOBAL_POSITION_INT',{...position,lat:0},43);expect(v.snapshot().position.latitude).toBe(6.9271);
 expect(v.snapshot().link.ages).toMatchObject({position:800,attitude:0});now+=1300;feed('HEARTBEAT',identity);
 expect(v.snapshot().position).toBeNull();expect(v.snapshot().attitude).toBeTruthy();
 feed('GLOBAL_POSITION_INT',{...position,time_boot_ms:3100});expect(v.snapshot().position.relativeAltitude).toBe(25);
 feed('GLOBAL_POSITION_INT',{...position,time_boot_ms:3200,lat:910000000});expect(v.snapshot().position).toBeNull();
 feed('ATTITUDE',{time_boot_ms:3300,roll:NaN,pitch:0,yaw:0});expect(v.snapshot().attitude).toBeNull();
});
