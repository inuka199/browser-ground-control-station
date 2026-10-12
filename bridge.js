import dgram from "dgram";
import MAVLink from "mavlink-2";
import { WebSocketServer } from "ws";

const UDP_HOST = process.env.UDP_HOST || "127.0.0.1";
const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT, 10) : 14550;
const WS_PORT = process.env.WS_PORT ? parseInt(process.env.WS_PORT, 10) : 8080;

// UDP socket for telemetry reception and outgoing commands
const socket = dgram.createSocket("udp4");
const wss = new WebSocketServer({ port: WS_PORT });

// 1. Telemetry receiver MAVLink parser (sysid: 0, compid: 0 accepts all messages)
const mav = new MAVLink(0, 0, "v2.0");

// 2. Separate MAVLink sender with non-zero Ground Control Station IDs
const GCS_SYSTEM_ID = 255;
const GCS_COMPONENT_ID = 190;
const mavSender = new MAVLink(GCS_SYSTEM_ID, GCS_COMPONENT_ID, "v2.0");

let senderReady = false;
mavSender.on("ready", () => {
  senderReady = true;
  console.log(`MAVLink sender ready (System ID: ${GCS_SYSTEM_ID}, Component ID: ${GCS_COMPONENT_ID})`);
});

/**
 * Patch createMessage on mavSender to adhere to MAVLink standard field ordering
 * (longest types first, as ordered in message.field). mavlink-2 default erroneously
 * sorts by initialPos in createMessage while decoding by sorted field order.
 */
mavSender.createMessage = function (msgid, data, cb) {
  if (this.sysid === 0 && this.compid === 0) {
    console.warn("System and component IDs are zero, cannot create message!");
    return;
  }

  const id = isNaN(Number(msgid)) ? this.getMessageID(msgid) : Number(msgid);
  const message = this.messagesByID[id];
  if (!message) {
    console.error(`Message '${msgid}' does not exist!`);
    return;
  }

  const payloadBuf = Buffer.alloc(message.payloadLength);
  let offset = 0;

  // Iterate over message.field in sorted order (type length descending)
  for (let i = 0; i < message.field.length; i++) {
    const field = message.field[i];
    const fieldName = field.$.name;
    if (data[fieldName] === undefined) {
      console.error(`MAVLink: No data supplied for '${fieldName}'`);
      return;
    }
    this.bufferField(payloadBuf, offset, field, data[fieldName]);
    offset += field.length;
  }

  const ext_buf = this.version === "v2.0" ? 1 : 0;
  const msgBuf = Buffer.alloc(message.payloadLength + 8 + ext_buf * 6);

  if (this.sequence++ === 255) {
    this.sequence = 0;
  }

  msgBuf[0] = this.startCharacter();
  msgBuf[1] = message.payloadLength;
  msgBuf[2 + ext_buf * 2] = this.sequence;
  msgBuf[3 + ext_buf * 2] = this.sysid;
  msgBuf[4 + ext_buf * 2] = this.compid;
  msgBuf[5 + ext_buf * 2] = id;

  payloadBuf.copy(msgBuf, 6 + ext_buf * 4, 0);

  const crc_buf = Buffer.alloc(message.payloadLength + 6 + ext_buf * 4);
  msgBuf.copy(crc_buf, 0, 1, message.payloadLength + 6 + ext_buf * 4);
  crc_buf[crc_buf.length - 1] = this.messageChecksums[id];
  msgBuf.writeUInt16LE(this.calculateChecksum(crc_buf), message.payloadLength + 6 + ext_buf * 4);

  const msgObj = {
    length: message.payloadLength,
    sequence: msgBuf[2 + ext_buf * 2],
    system: this.sysid,
    component: this.compid,
    id,
    payload: payloadBuf,
    buffer: msgBuf,
  };

  cb(msgObj);
};

const telemetry = {
  latitude: null,
  longitude: null,
  altitude: null,
  relativeAltitude: null,
  groundSpeed: null,
  batteryVoltage: null,
  batteryRemaining: null,
  flightMode: "UNKNOWN",
  roll: null,
  pitch: null,
  yaw: null,
};

const modeNames = {
  0: "STABILIZE",
  1: "ACRO",
  2: "ALT_HOLD",
  3: "AUTO",
  4: "GUIDED",
  5: "LOITER",
  6: "RTL",
  9: "LAND",
  16: "POSHOLD",
};

// Explicit allowlist of initially supported ArduCopter flight modes
const ALLOWED_MODES = {
  STABILIZE: 0,
  ALT_HOLD: 2,
  LOITER: 5,
};

// Diagnostic counters
let packetCount = 0;
const decodedMessageCounts = {};

// Track telemetry source endpoint and vehicle system ID
let droneEndpoint = null;
let droneSystemId = 1;
let pendingModeChange = null;

mav.on("ready", () => {
  console.log("MAVLink receiver definitions loaded");
});

mav.on("parse_message", (name, message, fields) => {
  if (!fields) return;

  decodedMessageCounts[name] = (decodedMessageCounts[name] || 0) + 1;

  if (message && message.system > 0) {
    droneSystemId = message.system;
  }

  switch (name) {
    case "GLOBAL_POSITION_INT":
      if (fields.lat !== undefined) telemetry.latitude = fields.lat / 1e7;
      if (fields.lon !== undefined) telemetry.longitude = fields.lon / 1e7;
      if (fields.alt !== undefined) telemetry.altitude = fields.alt / 1000;
      if (fields.relative_alt !== undefined) telemetry.relativeAltitude = fields.relative_alt / 1000;
      if (fields.vx !== undefined && fields.vy !== undefined) {
        telemetry.groundSpeed = Math.sqrt(fields.vx ** 2 + fields.vy ** 2) / 100;
      }
      break;

    case "SYS_STATUS":
      if (fields.voltage_battery !== undefined && fields.voltage_battery >= 0) {
        telemetry.batteryVoltage = fields.voltage_battery / 1000;
      }
      if (fields.battery_remaining !== undefined && fields.battery_remaining >= 0) {
        telemetry.batteryRemaining = fields.battery_remaining;
      }
      break;

    case "HEARTBEAT":
      if (fields.custom_mode !== undefined) {
        const currentMode =
          modeNames[fields.custom_mode] ?? `MODE_${fields.custom_mode}`;
        telemetry.flightMode = currentMode;

        // Confirm pending flight-mode change if HEARTBEAT matches requested mode
        if (pendingModeChange && pendingModeChange.mode === currentMode) {
          console.log(`[CONFIRMED] Flight mode confirmed via HEARTBEAT: ${currentMode}`);
          if (pendingModeChange.timer) {
            clearTimeout(pendingModeChange.timer);
          }
          broadcast({
            type: "COMMAND_STATUS",
            command: "SET_MODE",
            mode: currentMode,
            status: "CONFIRMED",
            message: `Flight mode confirmed: ${currentMode}`,
          });
          pendingModeChange = null;
        }
      }
      break;

    case "ATTITUDE":
      const toDegrees = (radians) => radians * (180 / Math.PI);
      if (fields.roll !== undefined) telemetry.roll = toDegrees(fields.roll);
      if (fields.pitch !== undefined) telemetry.pitch = toDegrees(fields.pitch);
      if (fields.yaw !== undefined) telemetry.yaw = toDegrees(fields.yaw);
      break;
  }
});

socket.on("message", (data, rinfo) => {
  packetCount++;

  // Capture the telemetry source endpoint as the potential response target
  if (rinfo && rinfo.port && rinfo.address) {
    droneEndpoint = {
      address: rinfo.address,
      port: rinfo.port,
    };
  }
  mav.parse(data);
});

socket.on("listening", () => {
  const addr = socket.address();
  console.log(`UDP bridge listening on ${addr.address}:${addr.port}`);
  console.log("Waiting for drone telemetry...");
  console.log("[Architecture Note] If SITL and MAVProxy run in WSL2, bridge.js must run inside WSL2 to receive packets sent to 127.0.0.1:14550.");
});

socket.on("error", (error) => {
  console.error("UDP socket error:", error.message);
});

function sendToClient(client, msgObj) {
  if (client && client.readyState === 1) {
    try {
      client.send(JSON.stringify(msgObj));
    } catch (err) {
      console.error("Failed to send message to client:", err.message);
    }
  }
}

function broadcast(msgObj) {
  const json = JSON.stringify(msgObj);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(json);
      } catch (err) {
        console.error("Broadcast error:", err.message);
      }
    }
  }
}

function handleSetModeCommand(client, requestedMode) {
  // 1. Validate requested mode against explicit allowlist
  if (!requestedMode || typeof requestedMode !== "string") {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: null,
      status: "REJECTED",
      message: "Missing or invalid flight mode parameter.",
    });
    return;
  }

  const normalizedMode = requestedMode.toUpperCase().trim();
  if (ALLOWED_MODES[normalizedMode] === undefined) {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "REJECTED",
      message: `Mode '${normalizedMode}' is not supported. Allowed modes: ${Object.keys(ALLOWED_MODES).join(", ")}.`,
    });
    return;
  }

  // 2. Check if MAVLink sender is ready
  if (!senderReady) {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "FAILED",
      message: "MAVLink sender definitions are still loading. Please retry.",
    });
    return;
  }

  // 3. Inspect destination endpoint (support environment overrides, otherwise use discovered endpoint)
  const targetHost = process.env.DRONE_COMMAND_HOST || (droneEndpoint ? droneEndpoint.address : null);
  const targetPort = process.env.DRONE_COMMAND_PORT
    ? parseInt(process.env.DRONE_COMMAND_PORT, 10)
    : (droneEndpoint ? droneEndpoint.port : null);

  if (!targetHost || !targetPort) {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "FAILED",
      message: "No active telemetry connection from drone/MAVProxy detected yet.",
    });
    return;
  }

  // Guard against sending into our own listening socket
  if ((targetHost === "127.0.0.1" || targetHost === "localhost") && targetPort === UDP_PORT) {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "FAILED",
      message: "Target port cannot be the bridge receiver port (14550).",
    });
    return;
  }

  // 4. Check if already in the requested mode
  if (telemetry.flightMode === normalizedMode) {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "CONFIRMED",
      message: `Drone is already in ${normalizedMode} mode.`,
    });
    return;
  }

  // 5. Encode and transmit SET_MODE message
  const customModeNumber = ALLOWED_MODES[normalizedMode];
  try {
    mavSender.createMessage(
      "SET_MODE",
      {
        target_system: droneSystemId || 1,
        base_mode: 1, // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
        custom_mode: customModeNumber,
      },
      (msg) => {
        socket.send(msg.buffer, targetPort, targetHost, (err) => {
          if (err) {
            console.error(`UDP send error to ${targetHost}:${targetPort}:`, err.message);
            sendToClient(client, {
              type: "COMMAND_STATUS",
              command: "SET_MODE",
              mode: normalizedMode,
              status: "FAILED",
              message: `UDP send error: ${err.message}`,
            });
            return;
          }

          console.log(`[SUBMITTED] SET_MODE (${normalizedMode} = ${customModeNumber}) sent to ${targetHost}:${targetPort}`);

          // Report command submission separately from confirmed mode changes
          sendToClient(client, {
            type: "COMMAND_STATUS",
            command: "SET_MODE",
            mode: normalizedMode,
            status: "SUBMITTED",
            message: `Command sent to drone. Waiting for HEARTBEAT confirmation...`,
          });

          // Set 6-second timeout awaiting telemetry confirmation
          if (pendingModeChange?.timer) {
            clearTimeout(pendingModeChange.timer);
          }

          const timer = setTimeout(() => {
            if (pendingModeChange && pendingModeChange.mode === normalizedMode) {
              console.warn(`[TIMEOUT] Mode change to ${normalizedMode} timed out without confirmation.`);
              broadcast({
                type: "COMMAND_STATUS",
                command: "SET_MODE",
                mode: normalizedMode,
                status: "TIMEOUT",
                message: `Mode change to ${normalizedMode} timed out without confirmation from drone telemetry.`,
              });
              pendingModeChange = null;
            }
          }, 6000);

          pendingModeChange = {
            mode: normalizedMode,
            timer,
          };
        });
      }
    );
  } catch (err) {
    console.error("Error creating SET_MODE message:", err);
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "SET_MODE",
      mode: normalizedMode,
      status: "FAILED",
      message: `Failed to construct MAVLink message: ${err.message}`,
    });
  }
}

function handleClientMessage(client, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "UNKNOWN",
      status: "REJECTED",
      message: "Malformed JSON payload.",
    });
    return;
  }

  if (!message || typeof message !== "object") {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: "UNKNOWN",
      status: "REJECTED",
      message: "Invalid command object.",
    });
    return;
  }

  if (message.type === "SET_MODE") {
    handleSetModeCommand(client, message.mode);
  } else {
    sendToClient(client, {
      type: "COMMAND_STATUS",
      command: message.type || "UNKNOWN",
      status: "REJECTED",
      message: `Unsupported command type: ${message.type}.`,
    });
  }
}

wss.on("listening", () => {
  console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
});

wss.on("connection", (client) => {
  console.log("Browser connected to telemetry WebSocket");
  client.send(JSON.stringify(telemetry));

  client.on("message", (raw) => {
    handleClientMessage(client, raw);
  });

  client.on("error", (err) => {
    console.error("WebSocket client error:", err.message);
  });
});

wss.on("error", (error) => {
  console.error("WebSocket server error:", error.message);
});

setInterval(() => {
  const data = JSON.stringify(telemetry);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try {
        client.send(data);
      } catch (err) {
        console.error("Error broadcasting to WebSocket client:", err.message);
      }
    }
  }

  console.log("\n[Telemetry Status]");
  console.log(`Packets received: ${packetCount} | Decoded message counts:`, decodedMessageCounts);
  console.log(`Active drone endpoint: ${droneEndpoint ? `${droneEndpoint.address}:${droneEndpoint.port}` : "None detected yet"}`);
  console.log("Current telemetry:", data);

  if (packetCount === 0) {
    console.warn("[DIAGNOSTIC] 0 UDP packets received. If ArduPilot/MAVProxy is in WSL2, bridge.js must run in WSL2 (wsl --cd /mnt/c/Users/User/Documents/Backup/gcs-project npm start).");
  }
}, 2000);

socket.bind(UDP_PORT, UDP_HOST);
