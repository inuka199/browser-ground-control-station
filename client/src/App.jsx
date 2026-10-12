import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ConnectionStatus from './components/ConnectionStatus';
import TelemetryWidget from './components/TelemetryWidget';

const WS_URL = 'ws://localhost:8080';

// Explicit allowlist of supported ArduCopter flight modes
const ALLOWED_MODES = ['STABILIZE', 'ALT_HOLD', 'LOITER'];

const initialTelemetry = {
  latitude: null,
  longitude: null,
  altitude: null,
  relativeAltitude: null,
  groundSpeed: null,
  batteryVoltage: null,
  batteryRemaining: null,
  flightMode: null,
  roll: null,
  pitch: null,
  yaw: null,
};

function App() {
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'reconnecting'
  const [telemetry, setTelemetry] = useState(initialTelemetry);
  const [selectedMode, setSelectedMode] = useState('STABILIZE');
  const [commandStatus, setCommandStatus] = useState({
    state: 'idle', // 'idle' | 'pending' | 'success' | 'error'
    message: '',
    targetMode: null,
  });

  const wsRef = useRef(null);

  useEffect(() => {
    let reconnectTimeout;

    const connectWebSocket = () => {
      setConnectionStatus(prev => prev === 'disconnected' ? 'connecting' : 'reconnecting');

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        console.log('Connected to Ground Control Station WebSocket');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle command response statuses from backend
          if (data.type === 'COMMAND_STATUS') {
            if (data.status === 'SUBMITTED') {
              setCommandStatus({
                state: 'pending',
                message: data.message || `Command submitted for ${data.mode}. Awaiting telemetry confirmation...`,
                targetMode: data.mode,
              });
            } else if (data.status === 'CONFIRMED') {
              setCommandStatus({
                state: 'success',
                message: data.message || `Flight mode confirmed: ${data.mode}`,
                targetMode: null,
              });
            } else if (data.status === 'REJECTED' || data.status === 'FAILED' || data.status === 'TIMEOUT') {
              setCommandStatus({
                state: 'error',
                message: data.message || `Command failed (${data.status}).`,
                targetMode: null,
              });
            }
            return;
          }

          // Handle live telemetry update
          setTelemetry(data);

          // HEARTBEAT is the authoritative source of truth:
          // Check if current mode matches our pending requested mode
          if (data.flightMode) {
            setCommandStatus((prev) => {
              if (prev.state === 'pending' && prev.targetMode === data.flightMode) {
                return {
                  state: 'success',
                  message: `Flight mode confirmed: ${data.flightMode}`,
                  targetMode: null,
                };
              }
              return prev;
            });
          }
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        setTelemetry(initialTelemetry); // Clear stale data on disconnect
        setCommandStatus({ state: 'idle', message: '', targetMode: null });

        // Attempt to reconnect after 3 seconds
        reconnectTimeout = setTimeout(() => {
          connectWebSocket();
        }, 3000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        ws.close(); // Force close to trigger onclose and reconnect
      };
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (wsRef.current) {
        // Prevent reconnect loop on unmount
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, []);

  const isCommandDisabled =
    connectionStatus !== 'connected' || commandStatus.state === 'pending';

  const handleModeChange = (e) => {
    e.preventDefault();

    if (isCommandDisabled) return;

    if (!selectedMode || !ALLOWED_MODES.includes(selectedMode)) {
      setCommandStatus({
        state: 'error',
        message: 'Invalid flight mode selected.',
        targetMode: null,
      });
      return;
    }

    if (telemetry.flightMode === selectedMode) {
      setCommandStatus({
        state: 'success',
        message: `Drone is already in ${selectedMode} mode.`,
        targetMode: null,
      });
      return;
    }

    try {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        setCommandStatus({
          state: 'pending',
          message: `Sending request to switch mode to ${selectedMode}...`,
          targetMode: selectedMode,
        });

        wsRef.current.send(
          JSON.stringify({
            type: 'SET_MODE',
            mode: selectedMode,
          })
        );
      } else {
        setCommandStatus({
          state: 'error',
          message: 'WebSocket connection is not ready.',
          targetMode: null,
        });
      }
    } catch (err) {
      setCommandStatus({
        state: 'error',
        message: `Error sending command: ${err.message}`,
        targetMode: null,
      });
    }
  };

  return (
    <div className="app-container">
      <header className="header">
        <h1>Nexus GCS</h1>
        <ConnectionStatus status={connectionStatus} />
      </header>

      {/* Flight Mode Command Section */}
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
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={isCommandDisabled || telemetry.flightMode === selectedMode}
            className={`btn-set-mode ${commandStatus.state === 'pending' ? 'btn-pending' : ''}`}
          >
            {commandStatus.state === 'pending' ? 'Sending...' : 'Set Mode'}
          </button>
        </form>

        {commandStatus.state !== 'idle' && (
          <div className={`command-status-banner status-${commandStatus.state}`}>
            {commandStatus.state === 'pending' && <span className="status-spinner" />}
            <span className="status-message">{commandStatus.message}</span>
          </div>
        )}
      </section>

      <main className="dashboard-grid">
        <TelemetryWidget
          title="Flight Mode"
          value={telemetry.flightMode}
          type="mode"
        />
        <TelemetryWidget
          title="Altitude (MSL)"
          value={telemetry.altitude}
          unit="m"
        />
        <TelemetryWidget
          title="Relative Alt"
          value={telemetry.relativeAltitude}
          unit="m"
        />
        <TelemetryWidget
          title="Ground Speed"
          value={telemetry.groundSpeed}
          unit="m/s"
        />
        <TelemetryWidget
          title="Battery Remaining"
          value={telemetry.batteryRemaining}
          unit="%"
          type="battery"
        />
        <TelemetryWidget
          title="Battery Voltage"
          value={telemetry.batteryVoltage}
          unit="V"
        />
        <TelemetryWidget
          title="Latitude"
          value={telemetry.latitude}
          unit="°"
        />
        <TelemetryWidget
          title="Longitude"
          value={telemetry.longitude}
          unit="°"
        />
        <TelemetryWidget
          title="Roll"
          value={telemetry.roll}
          unit="°"
        />
        <TelemetryWidget
          title="Pitch"
          value={telemetry.pitch}
          unit="°"
        />
        <TelemetryWidget
          title="Yaw"
          value={telemetry.yaw}
          unit="°"
        />
      </main>
    </div>
  );
}

export default App;

