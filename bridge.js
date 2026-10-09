import dgram from "dgram";
import MAVLink from "mavlink-2";
import { WebSocketServer } from "ws";

const UDP_PORT = 14550;
const WS_PORT = 8080;

const socket = dgram.createSocket("udp4");
const wss = new WebSocketServer({ port: WS_PORT });
const mav = new MAVLink(0, 0, "v2.0");

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

mav.on("ready", () => {
  console.log("MAVLink definitions loaded");
});

mav.on("parse_message", (name, message, fields) => {
  if (!fields) return;

  switch (name) {
    case "GLOBAL_POSITION_INT":
      telemetry.latitude = fields.lat / 1e7;
      telemetry.longitude = fields.lon / 1e7;
      telemetry.altitude = fields.alt / 1000;
      telemetry.relativeAltitude = fields.relative_alt / 1000;
      telemetry.groundSpeed =
        Math.sqrt(fields.vx ** 2 + fields.vy ** 2) / 100;
      break;

    case "SYS_STATUS":
      telemetry.batteryVoltage =
        fields.voltage_battery >= 0
          ? fields.voltage_battery / 1000
          : null;
      telemetry.batteryRemaining =
        fields.battery_remaining >= 0
          ? fields.battery_remaining
          : null;
      break;

    case "HEARTBEAT":
      telemetry.flightMode =
        modeNames[fields.custom_mode] ?? `MODE_${fields.custom_mode}`;
      break;

    case "ATTITUDE":
      const toDegrees = (radians) => radians * (180 / Math.PI);
      telemetry.roll = toDegrees(fields.roll);
      telemetry.pitch = toDegrees(fields.pitch);
      telemetry.yaw = toDegrees(fields.yaw);
      break;
  }
});

socket.on("message", (data) => {
  mav.parse(data);
});

socket.on("listening", () => {
  console.log(`UDP bridge listening on 127.0.0.1:${UDP_PORT}`);
  console.log("Waiting for drone telemetry...");
});

socket.on("error", (error) => {
  console.error("UDP error:", error.message);
});

wss.on("listening", () => {
  console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
});

wss.on("connection", (client) => {
  console.log("Browser connected to telemetry WebSocket");
  client.send(JSON.stringify(telemetry));
});

wss.on("error", (error) => {
  console.error("WebSocket error:", error.message);
});

setInterval(() => {
  const data = JSON.stringify(telemetry);

  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }

  console.log("\nCurrent telemetry:");
  console.log(data);
}, 2000);

socket.bind(UDP_PORT, "127.0.0.1");
