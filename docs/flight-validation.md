# Live station validation

The software checks exercise the browser and bridge. Flight-controller evidence for an actual fence-triggered return with the station offline is outstanding. Development used no aircraft hardware.

## Evidence from this checkout

| Check | Observed result |
| --- | --- |
| Bridge suite | 19 passed, including a real WebSocket connection over local IPC, a synthetic MAVLink source, session loss and parameter readback. |
| Frontend and simulator suite | 169 passed. Includes home HUD, stale and out-of-order reports, traffic models, pedestrian behaviour, audio scheduling and ocean displacement. Audio tests use a test audio graph. |
| Ocean render | The production water shader sources with Three.js shader chunks compiled and linked in software OpenGL. A 6,264-triangle section of the actual mesh produced distinct frames at 0 and 2.5 simulated seconds. Full browser visual inspection and listening on a playback device remain outstanding. |
| Lint and production build | Lint completed without findings. Vite built the frontend and reported a graphics bundle over its 500 kB warning threshold. |
| Native WebSocket and UDP integration | Attempted with a synthetic peer. Windows denied the loopback TCP connection with EACCES, before the transport scenario could complete. |
| ArduPilot SITL | Attempted. A Windows Copter SITL executable was unavailable and WSL returned Wsl/E_ACCESSDENIED. No firmware flight scenario ran here. |

The implementation is in `bridge.js`, `bridge/{protocol,vehicleState,controlEngine,safetyConfig}.js`, `shared/homeGuidance.js`, `client/src/services/liveStation.js` and the LiveStation view. The bridge/flight test suites are under `test/` and the disarmed firmware integration test is under `test-sitl/`. Simulator traffic, pedestrians, waves and harbourside boats are in `client/src/components/simulator/world/`. The simulator's `streetAudio.js` and `flightAudio.js` select and synthesize the nearby sounds.

## Audit and operating scope

| Area | Findings and current behaviour |
| --- | --- |
| Aircraft identity | The UDP bridge selects a flight-controller heartbeat from component 1, pins its endpoint and system ID, and requests firmware and capabilities. Multicopter MAV types with the ArduPilot autopilot ID can enter live control. Plane, Rover, conventional helicopter and other autopilots are outside this scope. |
| Home and map | A first GPS fix can anchor a replay scene. The live map accepts only an autopilot HOME_POSITION for the current connection. Arming edges, aircraft heartbeat loss and detected reboot invalidate home. Stale navigation suppresses the aircraft-to-home arrow. Aircraft yaw or reported heading supplies orientation while stationary. The north-up map needs no map tiles. |
| Distinct locations | The HOME marker represents the autopilot home. Operator GPS and individual rally coordinates are unavailable on this display. Unknown rally configuration or stored rally points prompt a possible alternate-destination message. The dashed line conveys straight-line direction with unknown obstacle clearance. There is no live video input. |
| Ownership | Only the live route can acquire the exclusive lease. The bridge sends a 1 Hz GCS heartbeat while one operator owns control. Closing the socket releases immediately. A hidden or stalled browser stops renewing its 3.5-second lease. The aircraft has its own GCS failsafe timeout. Simulation and replay are observers. Reconnect starts without ownership or queued flight commands. |
| Configuration | The editor uses pinned metadata for stable Copter 4.5.7 and 4.6.3, above-home altitude and centimetre-valued RTL parameters. Other releases and terrain-relative RTL have no write path in the editor. Existing fence bits are preserved. The breach action is shared across enabled fences. Preview the change to that action before applying. RC, battery, rally and GCS parameters are inspected without changing them. |
| Distance and return | The early warning uses a 5 m hysteresis band and lasts for the bridge/aircraft session. The onboard circle, action and ceiling are separate. A measured distance crossing and a controller-reported breach are shown independently. Active status requires current settings, a confirmed home, healthy navigation and the controller's fence status bit. No browser distance event issues a flight command. |
| Manual RTL | Explicit confirmation requests DO_SET_MODE. An unacknowledged RTL can retry once. ACK, observed RTL mode, interruption and a confirmed landed/disarmed arrival near the original home are separate outcomes. A landing at an unknown or rally destination can remain unconfirmed. |

Parameter references: [4.5.7](https://ardupilot.org/copter/docs/parameters-Copter-stable-V4.5.7.html), [4.6.3](https://ardupilot.org/copter/docs/parameters-Copter-stable-V4.6.3.html). Behaviour references: [fence](https://ardupilot.org/copter/docs/common-geofencing-landing-page.html), [RTL](https://ardupilot.org/copter/docs/rtl-mode.html), [GCS failsafe](https://ardupilot.org/copter/docs/gcs-failsafe.html).

## Connections and startup

Use the root README to start the frontend and bridge. A real installation needs a physical connection from the controller's telemetry port through a radio pair, USB serial, or a trusted onboard network router to the computer running the bridge. Configure the router for the actual port, baud rate and MAVLink protocol of that installation. Forward bidirectional UDP to the bridge's bound address. A hosted frontend alone has no access to that stream.

| Setting | Purpose |
| --- | --- |
| UDP_HOST, UDP_PORT | Default 127.0.0.1 and 14550. A non-loopback bind requires DRONE_ROUTER_IP. The bridge sends back to the pinned source endpoint. |
| DRONE_SYSTEM_ID | Restrict control and observation to the expected aircraft. Use a single trusted router-to-aircraft path. Signed radio links must be authenticated by a trusted router before forwarding locally. |
| WS_HOST, WS_PORT | Default 127.0.0.1 and 8080. Remote access needs GCS_TLS_CERT, GCS_TLS_KEY, GCS_TOKEN of at least 32 characters and an exact GCS_ORIGINS allowlist. Use HTTPS and set VITE_WS_URL to the WSS endpoint before building. |
| GCS_ALLOW_CONTROL | Set to 1 to enable explicit operator acquisition. Omit this for bench observation. Supply a configured token through the Live station authentication form. |
| GCS heartbeat | Bridge sender is system 255, component 190. Check SYSID_MYGCS and all other heartbeat sources. A router or other ground station using the monitored GCS identity can mask a browser or bridge failure. |

## Stage 1 — SITL

Use a local Copter build and disposable SITL state with hardware disconnected. From this repository in the same Linux/WSL environment as ArduPilot:

```bash
ARDUPILOT_ROOT=~/ardupilot npm run test:sitl
GCS_TEST_NETWORK=1 npm test
```

The first target starts its own Copter executable and bridge, writes simulator state and logs under a new temporary directory, and tests disarmed discovery, confirmed home, rejected RTL, closing and reopening the station, loss of aircraft heartbeat and a process restart. It fails if the binary or default parameters are missing. It leaves the simulator disarmed. The second uses a synthetic aircraft over native loopback TCP/UDP. The default `npm test` uses local IPC for WebSocket and injected MAVLink datagrams.

For the flight scenarios, use the README startup commands with a disposable SITL and enable live control only on that dedicated bridge. Record firmware, system/component, starting parameters, selected limits, operator actions, controller DataFlash log and a timestamped passive packet capture. Choose the test limits explicitly. Use a simulated pilot input independent of the browser and a passive observer for the link-loss scenarios.

| Case | Evidence to capture |
| --- | --- |
| Home, rearm and manual RTL | Observe home and its re-request after arming. Turn the simulated aircraft in place and cross north. The arrow should rotate with heading at zero groundspeed. Request RTL once and compare the UI timeline with the ACK, heartbeat mode and final landed state. Repeat with a rally point and with nonzero final hover height. |
| Distance and Loiter avoidance | Preview and verify the circle and ceiling while disarmed. Check unrelated fence bits and failsafes against the saved parameters. Approach and then oscillate around the warning threshold. In Loiter a stop inside the fence can be the expected result. Record measured peak distance, breach status and mode. |
| Actual breach with bridge unavailable | From within the verified circle, record the last station heartbeat and stop the bridge. In SITL use pilot input in an applicable mode to cross the configured boundary. Preserve the controller's independent log. Require evidence of the breach, mode-change reason attributable to the fence, RTL or the documented navigation fallback, and the resulting trajectory. A GCS-loss RTL that occurs first is a different test result. Compare with an equivalent connected run. |
| Missing home and rejected commands | Filter HOME_POSITION from a fresh station session. Verify the empty HOME state and inhibited RTL. Separately capture an autopilot rejection and absence of a mode change. Restore the stream and verify that only current home is displayed. |
| GPS/EKF fault | Use a SITL sensor fault. Record the degraded navigation flags, withdrawn directional cue and actual controller failsafe response. Recover GPS and confirm new position and estimator samples. |
| Browser, bridge and telemetry loss | In three separate runs close the controlling tab, stop the bridge, and interrupt the aircraft telemetry stream. Check the last heartbeat at the receiver, the autopilot's configured timeout/action and loss of control ownership. A second observer must not keep the controlling heartbeat alive. |
| Reconnect and reboot | Reopen the station while the aircraft remains in its chosen mode. Verify fresh home, empty pending command and explicit acquisition. Restart the Copter process and repeat with its new boot clock. No prior-flight home or command should appear. |

## Stage 2 — propellers-off bench

Keep the vehicle disarmed, remove all propellers and use the observation bridge. Check the physical port, baud, expected identity, firmware, heartbeat, battery units and status against the existing trusted GCS. Compare HOME_POSITION with that station and compare heading with the aircraft's orientation. Disconnect each physical link in turn and record loss, timeout and recovery. Independently review the saved onboard parameters, rally points, altitude frame and source of the monitored GCS heartbeat.

## Stage 3 — supervised flight

After the bench and SITL evidence is reviewed, use a qualified pilot, a clear approved site, a tested independent pilot link and limits selected for that flight. Start with a short visual-range flight and compare the arrow, orientation and home marker with the aircraft's observed position. Verify manual RTL, pilot intervention and the landing or hover outcome under supervision. Keep deliberate breach, GPS failure and combined link-loss experiments in SITL. Record discrepancies before expanding the test envelope.
