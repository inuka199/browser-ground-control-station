import dgram from "dgram";
import MAVLink from "mavlink-2";
import { WebSocketServer } from "ws";

const UDP_HOST = process.env.UDP_HOST || "127.0.0.1";
const UDP_PORT = process.env.UDP_PORT ? parseInt(process.env.UDP_PORT, 10) : 14550;
const WS_PORT  = process.env.WS_PORT  ? parseInt(process.env.WS_PORT,  10) : 8080;

// ── UDP socket for telemetry reception and outgoing commands ──────────────────
const socket = dgram.createSocket("udp4");
const wss    = new WebSocketServer({ port: WS_PORT });

// ── MAVLink parser/sender instances ──────────────────────────────────────────
// 1. Receiver (sysid 0/0 accepts all messages)
const mav = new MAVLink(0, 0, "v2.0");

// 2. Sender with GCS IDs per MAVLink convention
const GCS_SYSTEM_ID    = 255;
const GCS_COMPONENT_ID = 190;
const mavSender = new MAVLink(GCS_SYSTEM_ID, GCS_COMPONENT_ID, "v2.0");

let senderReady = false;
mavSender.on("ready", () => {
  senderReady = true;
  console.log(`MAVLink sender ready (sysid=${GCS_SYSTEM_ID} compid=${GCS_COMPONENT_ID})`);
});

/**
 * Patched createMessage — uses sorted field order (type-length descending)
 * matching ArduPilot's wire format expectations.
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
  const msgBuf  = Buffer.alloc(message.payloadLength + 8 + ext_buf * 6);

  if (this.sequence++ === 255) this.sequence = 0;

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
  msgBuf.writeUInt16LE(
    this.calculateChecksum(crc_buf),
    message.payloadLength + 6 + ext_buf * 4,
  );

  cb({
    length:    message.payloadLength,
    sequence:  msgBuf[2 + ext_buf * 2],
    system:    this.sysid,
    component: this.compid,
    id,
    payload:   payloadBuf,
    buffer:    msgBuf,
  });
};

// ── Telemetry state ───────────────────────────────────────────────────────────
const telemetry = {
  latitude:         null,
  longitude:        null,
  altitude:         null,
  relativeAltitude: null,
  groundSpeed:      null,
  batteryVoltage:   null,
  batteryRemaining: null,
  flightMode:       "UNKNOWN",
  roll:             null,
  pitch:            null,
  yaw:              null,
  // Stage 4 additions
  isArmed:          false,   // extracted from HEARTBEAT base_mode bit 7
};

// ── ArduCopter flight mode names ─────────────────────────────────────────────
const modeNames = {
  0:  "STABILIZE",
  1:  "ACRO",
  2:  "ALT_HOLD",
  3:  "AUTO",
  4:  "GUIDED",
  5:  "LOITER",
  6:  "RTL",
  9:  "LAND",
  16: "POSHOLD",
};

// ── Allowed flight modes (sent via SET_MODE) ──────────────────────────────────
// Expanded in Stage 4 to include GUIDED, RTL, and LAND.
// All of these are SITL-only; no real-aircraft connection is implemented.
const ALLOWED_MODES = {
  STABILIZE: 0,
  ALT_HOLD:  2,
  GUIDED:    4,   // Stage 4 — required for TAKEOFF
  LOITER:    5,
  RTL:       6,   // Stage 4
  LAND:      9,   // Stage 4
};

// ── MAVLink command numbers (MAV_CMD) ─────────────────────────────────────────
const MAV_CMD_COMPONENT_ARM_DISARM = 400;  // param1: 1=arm 0=disarm
const MAV_CMD_NAV_TAKEOFF          = 22;   // param7: altitude metres

// ── Diagnostic counters ───────────────────────────────────────────────────────
let packetCount = 0;
const decodedMessageCounts = {};

// ── Vehicle state ─────────────────────────────────────────────────────────────
let droneEndpoint = null;
let droneSystemId = 1;

// ── Pending confirmation tracking ─────────────────────────────────────────────
let pendingModeChange   = null;   // { mode, timer }
let pendingCommandAck   = null;   // { cmdNum, label, client, timer }

// ── MAVLink receive ───────────────────────────────────────────────────────────
mav.on("ready", () => console.log("MAVLink receiver definitions loaded"));

mav.on("parse_message", (name, message, fields) => {
  if (!fields) return;

  decodedMessageCounts[name] = (decodedMessageCounts[name] || 0) + 1;
  if (message && message.system > 0) droneSystemId = message.system;

  switch (name) {
    case "GLOBAL_POSITION_INT":
      if (fields.lat           !== undefined) telemetry.latitude         = fields.lat           / 1e7;
      if (fields.lon           !== undefined) telemetry.longitude        = fields.lon           / 1e7;
      if (fields.alt           !== undefined) telemetry.altitude         = fields.alt           / 1000;
      if (fields.relative_alt  !== undefined) telemetry.relativeAltitude = fields.relative_alt  / 1000;
      if (fields.vx !== undefined && fields.vy !== undefined) {
        telemetry.groundSpeed = Math.sqrt(fields.vx ** 2 + fields.vy ** 2) / 100;
      }
      break;

    case "SYS_STATUS":
      if (fields.voltage_battery  !== undefined && fields.voltage_battery  >= 0)
        telemetry.batteryVoltage   = fields.voltage_battery  / 1000;
      if (fields.battery_remaining !== undefined && fields.battery_remaining >= 0)
        telemetry.batteryRemaining = fields.battery_remaining;
      break;

    case "HEARTBEAT": {
      // Flight mode from custom_mode
      if (fields.custom_mode !== undefined) {
        const currentMode = modeNames[fields.custom_mode] ?? `MODE_${fields.custom_mode}`;
        telemetry.flightMode = currentMode;

        // Confirm pending flight-mode change
        if (pendingModeChange && pendingModeChange.mode === currentMode) {
          console.log(`[CONFIRMED] Flight mode confirmed: ${currentMode}`);
          clearTimeout(pendingModeChange.timer);
          broadcast({
            type:    "COMMAND_STATUS",
            command: "SET_MODE",
            mode:    currentMode,
            status:  "CONFIRMED",
            message: `Flight mode confirmed: ${currentMode}`,
          });
          pendingModeChange = null;
        }
      }

      // ── Stage 4: extract armed status from base_mode bit 7 ───────────────
      // MAV_MODE_FLAG_SAFETY_ARMED = 128 (0x80)
      if (fields.base_mode !== undefined) {
        const wasArmed = telemetry.isArmed;
        telemetry.isArmed = !!(fields.base_mode & 128);

        // Confirm pending arm/disarm command if armed state changed
        if (pendingCommandAck && (
          (pendingCommandAck.cmdNum === MAV_CMD_COMPONENT_ARM_DISARM && wasArmed !== telemetry.isArmed)
        )) {
          const armedStr = telemetry.isArmed ? "ARMED" : "DISARMED";
          console.log(`[CONFIRMED] Arm/Disarm confirmed via HEARTBEAT: ${armedStr}`);
          clearTimeout(pendingCommandAck.timer);
          broadcast({
            type:    "COMMAND_STATUS",
            command: "COMMAND_LONG",
            label:   pendingCommandAck.label,
            status:  "CONFIRMED",
            message: `Vehicle ${armedStr}.`,
          });
          pendingCommandAck = null;
        }
      }
      break;
    }

    case "ATTITUDE":
      if (fields.roll  !== undefined) telemetry.roll  = fields.roll  * (180 / Math.PI);
      if (fields.pitch !== undefined) telemetry.pitch = fields.pitch * (180 / Math.PI);
      if (fields.yaw   !== undefined) telemetry.yaw   = fields.yaw   * (180 / Math.PI);
      break;

    // ── Stage 4: COMMAND_ACK ─────────────────────────────────────────────────
    // Used to confirm TAKEOFF commands (arm/disarm confirmed via HEARTBEAT instead)
    case "COMMAND_ACK":
      if (fields.command !== undefined && pendingCommandAck) {
        if (fields.command === pendingCommandAck.cmdNum) {
          const accepted = fields.result === 0;  // MAV_RESULT_ACCEPTED = 0
          console.log(`[COMMAND_ACK] cmd=${fields.command} result=${fields.result} accepted=${accepted}`);
          clearTimeout(pendingCommandAck.timer);
          broadcast({
            type:    "COMMAND_STATUS",
            command: "COMMAND_LONG",
            label:   pendingCommandAck.label,
            status:  accepted ? "CONFIRMED" : "REJECTED",
            message: accepted
              ? `${pendingCommandAck.label} accepted by vehicle.`
              : `${pendingCommandAck.label} rejected (MAV_RESULT=${fields.result}).`,
          });
          pendingCommandAck = null;
        }
      }
      break;
  }
});

// ── UDP receive ───────────────────────────────────────────────────────────────
socket.on("message", (data, rinfo) => {
  packetCount++;
  if (rinfo?.port && rinfo?.address) {
    droneEndpoint = { address: rinfo.address, port: rinfo.port };
  }
  mav.parse(data);
});

socket.on("listening", () => {
  const addr = socket.address();
  console.log(`UDP bridge listening on ${addr.address}:${addr.port}`);
  console.log("Waiting for drone telemetry...");
  console.log("[Note] If SITL/MAVProxy run in WSL2, bridge.js must also run in WSL2.");
});

socket.on("error", (err) => console.error("UDP socket error:", err.message));

// ── WebSocket helpers ─────────────────────────────────────────────────────────
function sendToClient(client, msgObj) {
  if (client?.readyState === 1) {
    try { client.send(JSON.stringify(msgObj)); }
    catch (err) { console.error("Failed to send to client:", err.message); }
  }
}

function broadcast(msgObj) {
  const json = JSON.stringify(msgObj);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(json); }
      catch (err) { console.error("Broadcast error:", err.message); }
    }
  }
}

// ── Common send-endpoint validation ──────────────────────────────────────────
function resolveTarget(client, commandLabel) {
  const targetHost = process.env.DRONE_COMMAND_HOST || droneEndpoint?.address;
  const targetPort = process.env.DRONE_COMMAND_PORT
    ? parseInt(process.env.DRONE_COMMAND_PORT, 10)
    : droneEndpoint?.port;

  if (!targetHost || !targetPort) {
    sendToClient(client, {
      type:    "COMMAND_STATUS",
      command: commandLabel,
      status:  "FAILED",
      message: "No active telemetry connection from drone/MAVProxy detected.",
    });
    return null;
  }

  if ((targetHost === "127.0.0.1" || targetHost === "localhost") && targetPort === UDP_PORT) {
    sendToClient(client, {
      type:    "COMMAND_STATUS",
      command: commandLabel,
      status:  "FAILED",
      message: "Target port cannot be the bridge receiver port.",
    });
    return null;
  }

  return { targetHost, targetPort };
}

// ── SET_MODE handler ──────────────────────────────────────────────────────────
function handleSetModeCommand(client, requestedMode) {
  if (!requestedMode || typeof requestedMode !== "string") {
    sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", status: "REJECTED", message: "Missing or invalid flight mode parameter." });
    return;
  }

  const mode = requestedMode.toUpperCase().trim();

  if (ALLOWED_MODES[mode] === undefined) {
    sendToClient(client, {
      type:    "COMMAND_STATUS",
      command: "SET_MODE",
      mode,
      status:  "REJECTED",
      message: `Mode '${mode}' is not supported. Allowed: ${Object.keys(ALLOWED_MODES).join(", ")}.`,
    });
    return;
  }

  if (!senderReady) {
    sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "FAILED", message: "MAVLink sender still loading. Retry in a moment." });
    return;
  }

  const ep = resolveTarget(client, "SET_MODE");
  if (!ep) return;

  if (telemetry.flightMode === mode) {
    sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "CONFIRMED", message: `Already in ${mode}.` });
    return;
  }

  try {
    mavSender.createMessage("SET_MODE", {
      target_system: droneSystemId || 1,
      base_mode:     1,  // MAV_MODE_FLAG_CUSTOM_MODE_ENABLED
      custom_mode:   ALLOWED_MODES[mode],
    }, (msg) => {
      socket.send(msg.buffer, ep.targetPort, ep.targetHost, (err) => {
        if (err) {
          console.error(`UDP send error: ${err.message}`);
          sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "FAILED", message: `UDP error: ${err.message}` });
          return;
        }
        console.log(`[SUBMITTED] SET_MODE ${mode} (${ALLOWED_MODES[mode]}) → ${ep.targetHost}:${ep.targetPort}`);
        sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "SUBMITTED", message: `SET_MODE ${mode} sent. Awaiting HEARTBEAT confirmation…` });

        if (pendingModeChange?.timer) clearTimeout(pendingModeChange.timer);
        const timer = setTimeout(() => {
          if (pendingModeChange?.mode === mode) {
            console.warn(`[TIMEOUT] SET_MODE ${mode} timed out`);
            broadcast({ type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "TIMEOUT", message: `Mode change to ${mode} timed out.` });
            pendingModeChange = null;
          }
        }, 6000);
        pendingModeChange = { mode, timer };
      });
    });
  } catch (err) {
    console.error("Error creating SET_MODE message:", err);
    sendToClient(client, { type: "COMMAND_STATUS", command: "SET_MODE", mode, status: "FAILED", message: `MAVLink error: ${err.message}` });
  }
}

// ── COMMAND_LONG handler (Stage 4) ────────────────────────────────────────────
function handleCommandLong(client, { command: cmdNum, params = [], label }) {
  // Validate command number
  const allowedCommands = [MAV_CMD_COMPONENT_ARM_DISARM, MAV_CMD_NAV_TAKEOFF];
  if (!allowedCommands.includes(cmdNum)) {
    sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "REJECTED", message: `Command ${cmdNum} not supported.` });
    return;
  }

  if (!senderReady) {
    sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "FAILED", message: "MAVLink sender still loading." });
    return;
  }

  const ep = resolveTarget(client, "COMMAND_LONG");
  if (!ep) return;

  // Per-command validations
  if (cmdNum === MAV_CMD_COMPONENT_ARM_DISARM) {
    const armFlag = params[0] ?? 1;
    if (armFlag === 1 && telemetry.isArmed) {
      sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "CONFIRMED", message: "Vehicle is already armed." });
      return;
    }
    if (armFlag === 0 && !telemetry.isArmed) {
      sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "CONFIRMED", message: "Vehicle is already disarmed." });
      return;
    }
  }

  if (cmdNum === MAV_CMD_NAV_TAKEOFF) {
    if (!telemetry.isArmed) {
      sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "REJECTED", message: "Cannot takeoff: vehicle is not armed." });
      return;
    }
    if (telemetry.flightMode !== "GUIDED") {
      sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "REJECTED", message: `Takeoff requires GUIDED mode (currently ${telemetry.flightMode}).` });
      return;
    }
  }

  // Build COMMAND_LONG payload
  // Fields: param1,param2,param3,param4,param5,param6,param7,command,target_system,target_component,confirmation
  const [p1=0, p2=0, p3=0, p4=0, p5=0, p6=0, p7=0] = params;

  try {
    mavSender.createMessage("COMMAND_LONG", {
      target_system:    droneSystemId || 1,
      target_component: 1,
      command:          cmdNum,
      confirmation:     0,
      param1: p1,
      param2: p2,
      param3: p3,
      param4: p4,
      param5: p5,
      param6: p6,
      param7: p7,
    }, (msg) => {
      socket.send(msg.buffer, ep.targetPort, ep.targetHost, (err) => {
        if (err) {
          console.error(`UDP send error (COMMAND_LONG): ${err.message}`);
          sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "FAILED", message: `UDP error: ${err.message}` });
          return;
        }

        console.log(`[SUBMITTED] COMMAND_LONG cmd=${cmdNum} (${label}) → ${ep.targetHost}:${ep.targetPort}`);
        sendToClient(client, {
          type:    "COMMAND_STATUS",
          command: "COMMAND_LONG",
          label,
          status:  "SUBMITTED",
          message: `${label} sent. Awaiting acknowledgement…`,
        });

        // Set up timeout for ACK/HEARTBEAT confirmation
        if (pendingCommandAck?.timer) clearTimeout(pendingCommandAck.timer);
        const timer = setTimeout(() => {
          if (pendingCommandAck?.cmdNum === cmdNum) {
            console.warn(`[TIMEOUT] ${label} timed out without ACK`);
            broadcast({
              type:    "COMMAND_STATUS",
              command: "COMMAND_LONG",
              label,
              status:  "TIMEOUT",
              message: `${label} timed out without vehicle acknowledgement.`,
            });
            pendingCommandAck = null;
          }
        }, 8000);
        pendingCommandAck = { cmdNum, label, client, timer };
      });
    });
  } catch (err) {
    console.error("Error creating COMMAND_LONG message:", err);
    sendToClient(client, { type: "COMMAND_STATUS", command: "COMMAND_LONG", label, status: "FAILED", message: `MAVLink error: ${err.message}` });
  }
}

// ── Client message router ─────────────────────────────────────────────────────
function handleClientMessage(client, rawMessage) {
  let message;
  try {
    message = JSON.parse(rawMessage);
  } catch {
    sendToClient(client, { type: "COMMAND_STATUS", command: "UNKNOWN", status: "REJECTED", message: "Malformed JSON payload." });
    return;
  }

  if (!message || typeof message !== "object") {
    sendToClient(client, { type: "COMMAND_STATUS", command: "UNKNOWN", status: "REJECTED", message: "Invalid command object." });
    return;
  }

  switch (message.type) {
    case "SET_MODE":
      handleSetModeCommand(client, message.mode);
      break;

    case "COMMAND_LONG":
      handleCommandLong(client, {
        command: message.command,
        params:  message.params ?? [],
        label:   message.label  ?? `CMD_${message.command}`,
      });
      break;

    default:
      sendToClient(client, {
        type:    "COMMAND_STATUS",
        command: message.type || "UNKNOWN",
        status:  "REJECTED",
        message: `Unsupported command type: '${message.type}'.`,
      });
  }
}

// ── WebSocket server ──────────────────────────────────────────────────────────
wss.on("listening", () => console.log(`WebSocket server on ws://localhost:${WS_PORT}`));

wss.on("connection", (client) => {
  console.log("Browser connected to WebSocket");
  client.send(JSON.stringify(telemetry));

  client.on("message", (raw) => handleClientMessage(client, raw));
  client.on("error",   (err) => console.error("WS client error:", err.message));
});

wss.on("error", (err) => console.error("WebSocket server error:", err.message));

// ── Telemetry broadcast loop (every 2 s) ──────────────────────────────────────
setInterval(() => {
  const data = JSON.stringify(telemetry);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      try { client.send(data); }
      catch (err) { console.error("Broadcast error:", err.message); }
    }
  }

  console.log("\n[Telemetry]", data);
  console.log(`Packets: ${packetCount} | Decoded:`, decodedMessageCounts);
  console.log(`Drone endpoint: ${droneEndpoint ? `${droneEndpoint.address}:${droneEndpoint.port}` : "None"}`);

  if (packetCount === 0) {
    console.warn("[DIAGNOSTIC] 0 UDP packets. If SITL/MAVProxy are in WSL2, run bridge in WSL2:\n  wsl --cd /mnt/c/Users/User/Documents/Backup/gcs-project npm start");
  }
}, 2000);

// ── Bind UDP ──────────────────────────────────────────────────────────────────
socket.bind(UDP_PORT, UDP_HOST);
