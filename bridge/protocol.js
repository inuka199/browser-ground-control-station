// Restricted MAVLink common/ardupilotmega wire schema. Offsets follow the official
// https://mavlink.io/en/messages/{common,ardupilotmega}.html definitions.
// Keep CRC_EXTRA and base lengths fixed; MAVLink 2 extensions never change them.
const field = (name, type, offset, count) => ({ name, type, offset, count });
const f = field;
const definitions = [
  [0, 'HEARTBEAT', 9, 9, 50, [f('custom_mode','u32',0), f('type','u8',4), f('autopilot','u8',5), f('base_mode','u8',6), f('system_status','u8',7), f('mavlink_version','u8',8)]],
  [1, 'SYS_STATUS', 31, 31, 124, [f('onboard_control_sensors_present','u32',0), f('onboard_control_sensors_enabled','u32',4), f('onboard_control_sensors_health','u32',8), f('voltage_battery','u16',14), f('current_battery','i16',16), f('battery_remaining','i8',30)]],
  [11, 'SET_MODE', 6, 6, 89, [f('custom_mode','u32',0), f('target_system','u8',4), f('base_mode','u8',5)]],
  [20, 'PARAM_REQUEST_READ', 20, 20, 214, [f('param_index','i16',0), f('target_system','u8',2), f('target_component','u8',3), f('param_id','text',4,16)]],
  [22, 'PARAM_VALUE', 25, 25, 220, [f('param_value','float',0), f('param_count','u16',4), f('param_index','u16',6), f('param_id','text',8,16), f('param_type','u8',24)]],
  [23, 'PARAM_SET', 23, 23, 168, [f('param_value','float',0), f('target_system','u8',4), f('target_component','u8',5), f('param_id','text',6,16), f('param_type','u8',22)]],
  [24, 'GPS_RAW_INT', 30, 52, 24, [f('time_usec','u64',0), f('lat','i32',8), f('lon','i32',12), f('alt','i32',16), f('eph','u16',20), f('fix_type','u8',28), f('satellites_visible','u8',29)]],
  [30, 'ATTITUDE', 28, 28, 39, [f('time_boot_ms','u32',0), f('roll','float',4), f('pitch','float',8), f('yaw','float',12)]],
  [33, 'GLOBAL_POSITION_INT', 28, 28, 104, [f('time_boot_ms','u32',0), f('lat','i32',4), f('lon','i32',8), f('alt','i32',12), f('relative_alt','i32',16), f('vx','i16',20), f('vy','i16',22), f('vz','i16',24), f('hdg','u16',26)]],
  [76, 'COMMAND_LONG', 33, 33, 152, [...Array.from({length:7}, (_,i) => f(`param${i+1}`,'float',i*4)), f('command','u16',28), f('target_system','u8',30), f('target_component','u8',31), f('confirmation','u8',32)]],
  [77, 'COMMAND_ACK', 3, 10, 143, [f('command','u16',0), f('result','u8',2), f('progress','u8',3), f('result_param2','i32',4), f('target_system','u8',8), f('target_component','u8',9)]],
  [148, 'AUTOPILOT_VERSION', 60, 78, 178, [f('capabilities','u64',0), f('uid','u64',8), f('flight_sw_version','u32',16), f('vendor_id','u16',32), f('product_id','u16',34)]],
  [162, 'FENCE_STATUS', 8, 9, 189, [f('breach_time','u32',0), f('breach_count','u16',4), f('breach_status','u8',6), f('breach_type','u8',7)]],
  [193, 'EKF_STATUS_REPORT', 22, 26, 71, [f('velocity_variance','float',0), f('pos_horiz_variance','float',4), f('pos_vert_variance','float',8), f('compass_variance','float',12), f('terrain_alt_variance','float',16), f('flags','u16',20)]],
  [242, 'HOME_POSITION', 52, 60, 104, [f('latitude','i32',0), f('longitude','i32',4), f('altitude','i32',8), f('time_usec','u64',52)]],
  [245, 'EXTENDED_SYS_STATE', 2, 2, 130, [f('vtol_state','u8',0), f('landed_state','u8',1)]],
  [253, 'STATUSTEXT', 51, 54, 83, [f('severity','u8',0), f('text','text',1,50), f('id','u16',51), f('chunk_seq','u8',53)]],
];
export const schema = new Map(definitions.map(([id,name,min,length,extra,fields]) => [id,{id,name,min,length,extra,fields}]));
const methods = { u8:['readUInt8','writeUInt8'], i8:['readInt8','writeInt8'], u16:['readUInt16LE','writeUInt16LE'], i16:['readInt16LE','writeInt16LE'], u32:['readUInt32LE','writeUInt32LE'], i32:['readInt32LE','writeInt32LE'], float:['readFloatLE','writeFloatLE'], u64:['readBigUInt64LE','writeBigUInt64LE'] };
export function checksum(bytes) {
  let crc=65535;
  for (const byte of bytes) { let t=byte^(crc&255); t^=(t<<4)&255; crc=((crc>>8)^(t<<8)^(t<<3)^(t>>4))&65535; }
  return crc;
}
export function encode(name, values={}, {system=255,component=190,sequence=0,version=2}={}) {
  const def=[...schema.values()].find(d=>d.name===name); if(!def) throw Error('Unsupported MAVLink message');
  let payload=Buffer.alloc(version===1?def.min:def.length);
  for(const {name:key,type,offset,count} of def.fields) {
    if(offset>=payload.length) continue;
    const value=values[key]??0;
    if(type==='text') { if(typeof value==='string') payload.write(value,offset,count,'ascii'); }
    else payload[methods[type][1]](type==='u64'?BigInt(value):value,offset);
  }
  if(version===2) { let n=payload.length; while(n>1&&payload[n-1]===0)n--; payload=payload.subarray(0,n); }
  const h=Buffer.alloc(version===1?6:10); h[0]=version===1?0xfe:0xfd; h[1]=payload.length;
  if(version===1) { h[2]=sequence&255; h[3]=system; h[4]=component; h[5]=def.id; }
  else { h[4]=sequence&255; h[5]=system; h[6]=component; h.writeUIntLE(def.id,7,3); }
  const packet=Buffer.concat([h,payload,Buffer.alloc(2)]);
  packet.writeUInt16LE(checksum(Buffer.concat([packet.subarray(1,-2),Buffer.from([def.extra])])),packet.length-2);
  return packet;
}
export function decodeDatagram(data, diagnostics={}) {
  const messages=[];
  for(let off=0; off<data.length;) {
    const v2=data[off]===0xfd;
    if(!v2&&data[off]!==0xfe) {off++;continue;}
    const h=v2?10:6; if(off+h>data.length)break;
    const size=data[off+1], flags=v2?data[off+2]:0, end=off+h+size, total=h+size+2+((flags&1)?13:0);
    if(off+total>data.length)break;
    const id=v2?data.readUIntLE(off+7,3):data[off+5], def=schema.get(id);
    // Do not pretend to authenticate signed traffic. Use a verified MAVLink router
    // terminating signing and forwarding unsigned packets over a trusted local link.
    if(flags) diagnostics.unsupportedFlags=(diagnostics.unsupportedFlags||0)+1;
    else if(def&&size>0&&(v2||size===def.min)) {
      const crc=checksum(Buffer.concat([data.subarray(off+1,end),Buffer.from([def.extra])]));
      if(crc===data.readUInt16LE(end)) {
        const p=Buffer.alloc(Math.max(def.length,size)); data.copy(p,0,off+h,end); const fields={};
        for(const {name,type,offset,count} of def.fields) fields[name]=type==='text'?p.toString('utf8',offset,offset+count).split('\0')[0]:type==='u64'?p.readBigUInt64LE(offset).toString():p[methods[type][0]](offset);
        messages.push({name:def.name,id,system:data[off+(v2?5:3)],component:data[off+(v2?6:4)],sequence:data[off+(v2?4:2)],fields});
      } else diagnostics.badCrc=(diagnostics.badCrc||0)+1;
    }
    off+=total;
  }
  return messages;
}
