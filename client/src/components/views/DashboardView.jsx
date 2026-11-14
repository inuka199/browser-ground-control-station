/**
 * components/views/DashboardView.jsx
 * Primary telemetry dashboard — moved from App.jsx.
 * Reads state from Zustand stores instead of local useState.
 * Preserves 100% of the existing visual behaviour and layout.
 */
import React, { useState } from 'react';
import { useTelemetryStore } from '../../store/slices/telemetry.js';
import { useCommandStore } from '../../store/slices/commands.js';
import { useConnectionStore } from '../../store/slices/connection.js';
import { sendCommand } from '../../services/websocket.js';
import TelemetryWidget from '../TelemetryWidget.jsx';
import Attitude3DView from '../Attitude3DView.jsx';
import FlightPath3DView from '../FlightPath3DView.jsx';
import ConnectionStatus from '../ConnectionStatus.jsx';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { Link } from 'react-router-dom';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';

const ALLOWED_MODES = ['STABILIZE', 'ALT_HOLD', 'LOITER'];

export default function DashboardView() {
  const telemetry = useTelemetryStore((s) => s.data);
  const connectionStatus = useConnectionStore((s) => s.status);
  const commandState = useCommandStore((s) => s.state);
  const commandMessage = useCommandStore((s) => s.message);

  const { setPending, setSuccess, setError: setCmdError } = useCommandStore.getState();

  const [selectedMode, setSelectedMode] = useState('STABILIZE');
  const [detailsOpen,setDetailsOpen]=useState(false);

  const { fresh } = useTelemetryHealth();
  const isCommandDisabled = !fresh || commandState === 'pending';

  const handleModeChange = (e) => {
    e.preventDefault();
    if (isCommandDisabled) return;

    if (!selectedMode || !ALLOWED_MODES.includes(selectedMode)) {
      setCmdError('Invalid flight mode selected.');
      return;
    }
    if (telemetry.flightMode === selectedMode) {
      setSuccess(`Drone is already in ${selectedMode} mode.`);
      return;
    }

    setPending(selectedMode, `Sending request to switch mode to ${selectedMode}…`);
    const sent = sendCommand({ type: 'SET_MODE', mode: selectedMode });
    if (!sent) {
      setCmdError('WebSocket connection is not ready.');
    }
  };

  return (
    <div className="dashboard-view">
      {/* Header */}
      <header className="header">
        <h1>Nexus GCS</h1>
        <ConnectionStatus status={connectionStatus} />
      </header>
      <section className="home-launch">
        <span className="workspace-kicker">YOUR NEXT FLIGHT</span><h2>Take a moment. Take flight.</h2>
        <p>Explore the coast, head to the harbour, or try a challenge.</p>
        <div className="home-actions"><Link className="home-primary" to="/simulator" onClick={()=>useSimulatorStore.getState().setLaunchPoint('galle-face')}>Start flying →</Link>
        <Link to="/simulator" onClick={()=>useSimulatorStore.getState().setLaunchPoint('port-city')}>Explore Port City</Link><Link to="/garage">Choose drone</Link><Link to="/challenges">Challenges</Link></div>
      </section>
      <div className="home-shortcuts"><Link to="/recordings"><strong>Recordings</strong><span>Replay your flights</span></Link><Link to="/training"><strong>Learn to fly</strong><span>Short guided lessons</span></Link><Link to="/simulation"><strong>Flight setup</strong><span>Sky, sound & connection</span></Link></div>
      <details className="home-telemetry" onToggle={event=>setDetailsOpen(event.currentTarget.open)}><summary>Live telemetry & vehicle controls <span>{fresh?'Receiving telemetry':'Bridge offline'}</span></summary>
      {detailsOpen && <>
      {!fresh && <p className="workspace-notice">Connect the bridge for live vehicle data. <Link to="/help">Setup instructions</Link></p>}
      {/* Flight Mode Command Panel */}
      <section className="command-panel" aria-label="Flight Mode Commands">
        <div className="command-panel-header">
          <div className="command-title-group">
            <h2>Flight Mode Command</h2>
            <span className="command-subtitle">ArduPilot SITL Control (Simulation Only)</span>
          </div>
          <div className="current-mode-pill">
            <span className="pill-label">Active Mode:</span>
            <span className="pill-value">{telemetry.flightMode || '--'}</span>
          </div>
        </div>

        <form className="command-form" onSubmit={handleModeChange}>
          <div className="mode-select-container">
            <label htmlFor="flight-mode-select" className="mode-select-label">
              Target Mode
            </label>
            <select
              id="flight-mode-select"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
              disabled={isCommandDisabled}
              className="mode-dropdown"
            >
              {ALLOWED_MODES.map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isCommandDisabled || telemetry.flightMode === selectedMode}
            className={`btn-set-mode ${commandState === 'pending' ? 'btn-pending' : ''}`}
          >
            {commandState === 'pending' ? 'Sending…' : 'Set Mode'}
          </button>
        </form>

        {commandState !== 'idle' && (
          <div className={`command-status-banner status-${commandState}`}>
            {commandState === 'pending' && <span className="status-spinner" />}
            <span className="status-message">{commandMessage}</span>
          </div>
        )}
      </section>

      {/* 3D Attitude View */}
      <Attitude3DView
        roll={telemetry.roll}
        pitch={telemetry.pitch}
        yaw={telemetry.yaw}
      />

      {/* 3D Flight Path View */}
      <FlightPath3DView
        latitude={telemetry.latitude}
        longitude={telemetry.longitude}
        altitude={telemetry.altitude}
        relativeAltitude={telemetry.relativeAltitude}
      />

      {/* Telemetry Grid */}
      <main className="dashboard-grid">
        <TelemetryWidget title="Flight Mode" value={telemetry.flightMode} type="mode" />
        <TelemetryWidget title="Altitude (MSL)" value={telemetry.altitude} unit="m" />
        <TelemetryWidget title="Relative Alt" value={telemetry.relativeAltitude} unit="m" />
        <TelemetryWidget title="Ground Speed" value={telemetry.groundSpeed} unit="m/s" />
        <TelemetryWidget title="Battery Remaining" value={telemetry.batteryRemaining} unit="%" type="battery" />
        <TelemetryWidget title="Battery Voltage" value={telemetry.batteryVoltage} unit="V" />
        <TelemetryWidget title="Latitude" value={telemetry.latitude} unit="°" />
        <TelemetryWidget title="Longitude" value={telemetry.longitude} unit="°" />
        <TelemetryWidget title="Roll" value={telemetry.roll} unit="°" />
        <TelemetryWidget title="Pitch" value={telemetry.pitch} unit="°" />
        <TelemetryWidget title="Yaw" value={telemetry.yaw} unit="°" />
      </main>
      </>}
      </details>
    </div>
  );
}
