// The installed decoder needs zero padding for MAVLink 2's truncated payloads.
// Keep packet framing here so malformed UDP data cannot poison the next packet,
// MAVLink 1/2 can share a port, and signatures/unknown IDs are skipped correctly.
export function prepareDecoder(parser) {
  const decode = parser.decodeMessage;
  parser.decodeMessage = function (message) {
    const definition = this.messagesByID[message.id];
    if (!definition) return;
    const payload = Buffer.alloc(definition.payloadLength);
    message.payload.copy(payload);
    return decode.call(this, { ...message, length: payload.length, payload });
  };
}

export function receiveMavlinkDatagram(data, v1, v2) {
  if (!Buffer.isBuffer(data)) return;
  for (let offset = 0; offset < data.length;) {
    const version2 = data[offset] === 0xfd;
    if (!version2 && data[offset] !== 0xfe) { offset++; continue; }
    const headerLength = version2 ? 10 : 6;
    if (offset + headerLength > data.length) return;
    const payloadLength = data[offset + 1];
    const flags = version2 ? data[offset + 2] : 0;
    const packetLength = headerLength + payloadLength + 2;
    const totalLength = packetLength + ((flags & 1) ? 13 : 0);
    if (offset + totalLength > data.length) return;
    const id = version2 ? data.readUIntLE(offset + 7, 3) : data[offset + 5];
    const parser = version2 ? v2 : v1;
    // Only messages used by this bridge. Avoid the legacy parser's 8-bit ID aliasing.
    const definition = parser.messagesByID?.[id];
    if (!(flags & ~1) && payloadLength > 0 && (version2 || payloadLength >= definition?.payloadLength) &&
        [0, 1, 24, 30, 33, 77].includes(id) && definition) {
      parser.bufferIndex = 0;
      parser.messageLength = 0;
      try { parser.parse(data.subarray(offset, offset + packetLength)); }
      catch { /* Drop malformed frames; the next packet starts with a clean parser. */ }
      finally { parser.bufferIndex = 0; parser.messageLength = 0; }
    }
    offset += totalLength;
  }
}
