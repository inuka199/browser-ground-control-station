/**
 * simulator/FlightControlPanel.jsx  — Stage 4
 *
 * Beginner-friendly in-simulator flight control panel.
 * Shown as a slide-out drawer on the left side of the simulator,
 * toggled by pressing F or clicking the ✈ button on the HUD.
 *
 * Controls provided:
 *  - Connection status indicator
 *  - Armed / Disarmed status badge
 *  - Flight mode selector (SITL-only verified modes)
 *  - Arm / Disarm buttons
 *  - Takeoff (guided, configurable altitude)
 *  - Land (SET_MODE → LAND)
 *  - RTL (SET_MODE → RTL)
 *  - Command status row (SUBMITTED → CONFIRMED / ERROR / TIMEOUT)
 *  - Emergency stop guidance
 *  - Beginner tutorial accordion
 *
 * All commands go through sendCommand() → bridge.js → ArduPilot SITL.
 * No real-aircraft connection is implemented.
 *
 * Keyboard: W/S/A/D/arrows handled in KeyboardController.jsx (separate).
 */
import React, { useState, useRef, useCallback } from 'react';
import { useTelemetryStore }   from '../../store/slices/telemetry.js';
import { useConnectionStore }  from '../../store/slices/connection.js';
import { useCommandStore }     from '../../store/slices/commands.js';
import { sendCommand }         from '../../services/websocket.js';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';

// ── Modes available in this panel ────────────────────────────────────────────
// Only modes verified against the bridge ALLOWED_MODES allowlist.
const PANEL_MODES = [
  { id: 'STABILIZE', icon: '🕹️', desc: 'Manual — no auto-levelling' },
  { id: 'ALT_HOLD',  icon: '↕️',  desc: 'Barometer altitude hold' },
  { id: 'LOITER',    icon: '📍', desc: 'GPS position + alt hold' },
  { id: 'GUIDED',    icon: '🎯', desc: 'Required for Takeoff command' },
  { id: 'RTL',       icon: '🏠', desc: 'Return to launch & land' },
  { id: 'LAND',      icon: '⬇️', desc: 'Descend and land here' },
];

// ── Tutorial content ─────────────────────────────────────────────────────────
const TUTORIAL_SECTIONS = [
  {
    title: '1. Before Flying',
    body: `Ensure SITL is running and the bridge is connected (green dot above). 
The vehicle starts DISARMED in STABILIZE mode. 
Switch to GUIDED mode, then ARM, then use Takeoff.`,
  },
  {
    title: '2. Arming',
    body: `Arming powers the motors (in simulation). 
The vehicle will stay on the ground until a Takeoff command is sent. 
You must be in GUIDED mode to use the Takeoff button. 
Arming is rejected if already armed.`,
  },
  {
    title: '3. Takeoff',
    body: `Set the target altitude (metres above home), confirm GUIDED mode is active and vehicle is armed, then click Takeoff. 
The vehicle climbs to the target altitude and hovers. 
This sends MAVLink COMMAND_LONG / MAV_CMD_NAV_TAKEOFF.`,
  },
  {
    title: '4. Landing',
    body: `LAND mode: descends and lands at the current GPS position. 
RTL mode: flies back to the home point, then descends and lands. 
Both are flight mode changes — the vehicle handles the descent automatically.`,
  },
  {
    title: '5. Keyboard Controls',
    body: `Offline demo only: W / S throttle; A / D yaw;
↑ / ↓ fly forward / backward and tilt the nose down / up; ← / → roll.
Keyboard movement is not sent to the connected SITL vehicle.
C        — cycle camera mode
1–5      — select camera directly
I        — environment settings
H        — toggle HUD
Esc      — pause/resume visual renderer`,
  },
  {
    title: '6. Emergency in SITL',
    body: `This is a simulation — stopping the frontend does NOT stop the SITL vehicle. 
To stop immediately: close the ArduPilot SITL terminal or press Ctrl+C in the WSL2 session running sim_vehicle.py. 
There is no "panic" button that reliably halts a SITL vehicle from the GCS alone.`,
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusDot({ connected }) {
  return (
    <span
      className={`fcp-status-dot ${connected ? 'fcp-dot--live' : 'fcp-dot--offline'}`}
      title={connected ? 'Bridge connected' : 'Bridge offline'}
    />
  );
}

function ArmedBadge({ isArmed }) {
  if (isArmed === null) return <span className="fcp-armed-badge fcp-armed--unknown">UNKNOWN</span>;
  return isArmed
    ? <span className="fcp-armed-badge fcp-armed--armed">🔴 ARMED</span>
    : <span className="fcp-armed-badge fcp-armed--disarmed">🟢 DISARMED</span>;
}

function CommandStatusRow({ state, message }) {
  if (state === 'idle') return null;
  const cls = { pending: 'fcp-cmd--pending', success: 'fcp-cmd--success', error: 'fcp-cmd--error' }[state] || '';
  return (
    <div className={`fcp-cmd-status ${cls}`} role="status" aria-live="polite">
      {state === 'pending' && <span className="fcp-spinner" aria-hidden="true" />}
      <span className="fcp-cmd-msg">{message}</span>
    </div>
  );
}

function TutorialSection({ title, body, open, onToggle }) {
  return (
    <div className="fcp-tutorial-section">
      <button
        className={`fcp-tutorial-hd ${open ? 'fcp-tutorial-hd--open' : ''}`}
        onClick={onToggle}
        aria-expanded={open}
      >
        {title}
        <span className="fcp-tutorial-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <p className="fcp-tutorial-body">{body}</p>}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function FlightControlPanel({ onClose, compact = false }) {
  const telemetry     = useTelemetryStore((s) => s.data);
  const connStatus    = useConnectionStore((s) => s.status);
  const cmdState      = useCommandStore((s) => s.state);
  const cmdMessage    = useCommandStore((s) => s.message);
  const cmdHistory    = useCommandStore((s) => s.history);

  const [takeoffAlt, setTakeoffAlt]     = useState(10);
  const [openSection, setOpenSection]   = useState(null);
  const [showHistory, setShowHistory]   = useState(false);
  const panelRef = useRef(null);

  const isConnected = connStatus === 'connected';
  const { fresh: isLive } = useTelemetryHealth();
  const isBusy      = cmdState === 'pending';
  const isArmed     = telemetry.isArmed;
  const flightMode  = telemetry.flightMode;

  // Derived button disabled states
  const canArm      = isConnected && isLive && isArmed === false && !isBusy;
  const canDisarm   = isConnected && isLive && isArmed  && !isBusy;
  const canTakeoff  = isConnected && isLive && isArmed && flightMode === 'GUIDED' && !isBusy && Number.isFinite(takeoffAlt) && takeoffAlt >= 2 && takeoffAlt <= 100;
  const canLand     = isConnected && isLive && !isBusy;
  const canRTL      = isConnected && isLive && !isBusy;
  const canSetMode  = isConnected && isLive && !isBusy;

  // ── Command senders ─────────────────────────────────────────────────────────

  const sendSetMode = useCallback((mode) => {
    if (!canSetMode) return;
    sendCommand({ type: 'SET_MODE', mode });
  }, [canSetMode]);

  const sendArm = useCallback(() => {
    if (!canArm) return;
    sendCommand({
      type:    'COMMAND_LONG',
      command: 400,          // MAV_CMD_COMPONENT_ARM_DISARM
      params:  [1, 0, 0, 0, 0, 0, 0],
      label:   'ARM',
    });
  }, [canArm]);

  const sendDisarm = useCallback(() => {
    if (!canDisarm) return;
    sendCommand({
      type:    'COMMAND_LONG',
      command: 400,
      params:  [0, 0, 0, 0, 0, 0, 0],
      label:   'DISARM',
    });
  }, [canDisarm]);

  const sendTakeoff = useCallback(() => {
    if (!canTakeoff) return;
    const alt = Math.max(2, Math.min(100, takeoffAlt));
    sendCommand({
      type:    'COMMAND_LONG',
      command: 22,           // MAV_CMD_NAV_TAKEOFF
      params:  [0, 0, 0, 0, 0, 0, alt],
      label:   `TAKEOFF_${alt}m`,
    });
  }, [canTakeoff, takeoffAlt]);

  const sendLand = useCallback(() => {
    if (!canLand) return;
    sendCommand({ type: 'SET_MODE', mode: 'LAND' });
  }, [canLand]);

  const sendRTL = useCallback(() => {
    if (!canRTL) return;
    sendCommand({ type: 'SET_MODE', mode: 'RTL' });
  }, [canRTL]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flight-control-panel" ref={panelRef} role={onClose ? 'dialog' : 'region'} aria-label="Flight Control Panel">

      {/* Header */}
      <div className="fcp-header">
        <div className="fcp-header-left">
          <StatusDot connected={isConnected} />
          <span className="fcp-title">Flight Controls</span>
          <span className="fcp-subtitle">{isConnected ? (isLive ? 'LIVE' : 'STALE') : 'OFFLINE'}</span>
        </div>
        {onClose && <button className="fcp-close-btn" onClick={onClose} title="Close panel [F]">✕</button>}
      </div>

      {/* Status Row */}
      <div className="fcp-status-row">
        <ArmedBadge isArmed={isArmed} />
        <span className="fcp-mode-badge">{flightMode || '—'}</span>
        {isConnected && !isLive && (
          <span className="fcp-stale-warn">⚠ Stale telemetry</span>
        )}
      </div>

      {/* Not connected notice */}
      {!isConnected && (
        <div className="fcp-offline-notice">
          ⚠ Bridge offline — start the Node.js bridge and connect SITL/MAVProxy to receive telemetry and send commands.
        </div>
      )}

      {/* ── Flight Mode Selector ── */}
      <section className="fcp-section">
        <h3 className="fcp-section-title">Flight Mode</h3>
        <div className="fcp-mode-grid">
          {PANEL_MODES.map((m) => (
            <button
              key={m.id}
              id={`fcp-mode-${m.id.toLowerCase()}`}
              className={[
                'fcp-mode-btn',
                flightMode === m.id ? 'fcp-mode-btn--active' : '',
              ].join(' ')}
              onClick={() => sendSetMode(m.id)}
              disabled={!canSetMode || flightMode === m.id}
              title={m.desc}
            >
              <span className="fcp-mode-icon">{m.icon}</span>
              <span className="fcp-mode-id">{m.id}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Arm / Disarm ── */}
      <section className="fcp-section">
        <h3 className="fcp-section-title">Motor Arming</h3>
        <div className="fcp-arm-row">
          <button
            id="fcp-arm-btn"
            className="fcp-btn fcp-btn--arm"
            onClick={sendArm}
            disabled={!canArm}
            title={!isConnected ? 'Not connected' : isArmed ? 'Already armed' : 'Arm motors'}
          >
            🔴 ARM
          </button>
          <button
            id="fcp-disarm-btn"
            className="fcp-btn fcp-btn--disarm"
            onClick={sendDisarm}
            disabled={!canDisarm}
            title={!isArmed ? 'Already disarmed' : 'Disarm motors'}
          >
            🟢 DISARM
          </button>
        </div>
        {isArmed === false && (
          <p className="fcp-hint">Switch to <strong>GUIDED</strong> mode before arming for Takeoff.</p>
        )}
      </section>

      {/* ── Takeoff ── */}
      <section className="fcp-section">
        <h3 className="fcp-section-title">Takeoff</h3>
        <div className="fcp-takeoff-row">
          <label className="fcp-alt-label">
            Target Alt
            <input
              id="fcp-takeoff-alt"
              type="number"
              className="fcp-alt-input"
              min={2}
              max={100}
              step={1}
              value={takeoffAlt}
              onChange={(e) => setTakeoffAlt(Number(e.target.value))}
              aria-label="Takeoff altitude in metres"
            />
            <span className="fcp-alt-unit">m</span>
          </label>
          <button
            id="fcp-takeoff-btn"
            className="fcp-btn fcp-btn--takeoff"
            onClick={sendTakeoff}
            disabled={!canTakeoff}
            title={
              !isArmed ? 'Arm first' :
              flightMode !== 'GUIDED' ? 'Switch to GUIDED mode' :
              'Send takeoff command'
            }
          >
            🚀 Takeoff
          </button>
        </div>
        {!canTakeoff && isConnected && isLive && (
          <p className="fcp-hint">
            {!isArmed ? '① Arm first' : flightMode !== 'GUIDED' ? '② Switch to GUIDED mode' : ''}
          </p>
        )}
      </section>

      {/* ── Land / RTL ── */}
      <section className="fcp-section">
        <h3 className="fcp-section-title">Return & Land</h3>
        <div className="fcp-land-row">
          <button
            id="fcp-land-btn"
            className="fcp-btn fcp-btn--land"
            onClick={sendLand}
            disabled={!canLand}
            title="Descend and land at current position"
          >
            ⬇️ Land Here
          </button>
          <button
            id="fcp-rtl-btn"
            className="fcp-btn fcp-btn--rtl"
            onClick={sendRTL}
            disabled={!canRTL}
            title="Fly back to home point and land"
          >
            🏠 RTL
          </button>
        </div>
      </section>

      {/* ── Command Status ── */}
      <CommandStatusRow state={cmdState} message={cmdMessage} />

      {!compact && <>
      {/* ── Emergency Guidance ── */}
      <section className="fcp-section fcp-section--emergency">
        <h3 className="fcp-section-title fcp-title--emergency">⚠ Emergency (SITL)</h3>
        <p className="fcp-emergency-text">
          This is a <strong>simulation</strong>. Closing the browser does NOT stop the SITL vehicle.
          To halt immediately: press <kbd>Ctrl+C</kbd> in the SITL terminal (WSL2 or native).
        </p>
      </section>

      {/* ── Command History ── */}
      <section className="fcp-section">
        <button
          className="fcp-history-toggle"
          onClick={() => setShowHistory((v) => !v)}
        >
          {showHistory ? '▲' : '▼'} Command History ({cmdHistory.length})
        </button>
        {showHistory && (
          <div className="fcp-history-list">
            {cmdHistory.length === 0
              ? <p className="fcp-hint">No commands sent yet.</p>
              : cmdHistory.map((h, i) => (
                <div key={i} className={`fcp-history-item fcp-history--${h.status?.toLowerCase()}`}>
                  <span className="fcp-history-time">{h.time}</span>
                  <span className="fcp-history-label">{h.label}</span>
                  <span className="fcp-history-status">{h.status}</span>
                </div>
              ))
            }
          </div>
        )}
      </section>

      {/* ── Beginner Tutorial ── */}
      <section className="fcp-section">
        <h3 className="fcp-section-title">📖 Beginner Guide</h3>
        {TUTORIAL_SECTIONS.map((sec, i) => (
          <TutorialSection
            key={i}
            title={sec.title}
            body={sec.body}
            open={openSection === i}
            onToggle={() => setOpenSection(openSection === i ? null : i)}
          />
        ))}
      </section>
      </>}
    </div>
  );
}
