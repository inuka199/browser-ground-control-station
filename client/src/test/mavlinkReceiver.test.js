// @vitest-environment node
import { beforeAll, expect, it } from 'vitest';
import MAVLink from 'mavlink-2';
import { prepareDecoder, receiveMavlinkDatagram } from '../../../bridge/mavlinkReceiver.js';

let v1, v2;
const received = [];
beforeAll(async () => {
  const create = version => new Promise(resolve => {
    const parser = new MAVLink(0, 0, version);
    prepareDecoder(parser);
    parser.on('parse_message', (name, message, fields) => received.push({ name, system: message.system, fields }));
    parser.once('ready', () => resolve(parser));
  });
  [v1, v2] = await Promise.all([create('v1.0'), create('v2.0')]);
});

function packet(version2, { truncated = false, id = 33 } = {}) {
  let payload = Buffer.alloc(28);
  payload.writeUInt32LE(1000, 0);
  payload.writeInt32LE(515000000, 4);
  payload.writeInt32LE(-1000000, 8);
  payload.writeInt32LE(35000, 12);
  if (truncated) { let end = payload.length; while (end > 1 && payload[end - 1] === 0) end--; payload = payload.subarray(0, end); }
  const header = Buffer.alloc(version2 ? 10 : 6);
  header[0] = version2 ? 0xfd : 0xfe; header[1] = payload.length;
  if (version2) { header[4] = 1; header[5] = 42; header[6] = 1; header.writeUIntLE(id, 7, 3); }
  else { header[2] = 1; header[3] = 42; header[4] = 1; header[5] = id; }
  const data = Buffer.concat([header, payload, Buffer.alloc(2)]);
  const checksum = v2.calculateChecksum(Buffer.concat([data.subarray(1, -2), Buffer.from([104])]));
  data.writeUInt16LE(checksum, data.length - 2);
  return data;
}

it('accepts actual MAVLink 1 and truncated MAVLink 2 position packets from system 42', () => {
  received.length = 0;
  receiveMavlinkDatagram(Buffer.concat([packet(false), packet(true, { truncated: true })]), v1, v2);
  expect(received).toHaveLength(2);
  for (const sample of received) expect(sample).toMatchObject({ name: 'GLOBAL_POSITION_INT', system: 42, fields: { lat: 515000000, lon: -1000000, alt: 35000, relative_alt: 0, vx: 0, vy: 0, hdg: 0 } });
});

it('drops corrupt, incomplete and unknown packets and parses the next valid datagram', () => {
  received.length = 0;
  const corrupt = packet(true); corrupt[15] ^= 0xff;
  for (const data of [Buffer.from([0xfd]), packet(true).subarray(0, 18), corrupt, packet(true, { id: 289 }), Buffer.from('bad packet')]) {
    expect(() => receiveMavlinkDatagram(data, v1, v2)).not.toThrow();
  }
  expect(received).toHaveLength(0);
  receiveMavlinkDatagram(packet(true), v1, v2);
  expect(received).toHaveLength(1);
});
