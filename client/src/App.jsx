import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import ConnectionStatus from './components/ConnectionStatus';
import TelemetryWidget from './components/TelemetryWidget';

const WS_URL = 'ws://localhost:8080';

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
          setTelemetry(data);
        } catch (error) {
          console.error('Failed to parse telemetry data:', error);
        }
      };

      ws.onclose = () => {
        setConnectionStatus('disconnected');
        setTelemetry(initialTelemetry); // Clear stale data on disconnect
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

  return (
    <div className="app-container">
      <header className="header">
        <h1>Nexus GCS</h1>
        <ConnectionStatus status={connectionStatus} />
      </header>

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
