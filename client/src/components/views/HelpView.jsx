/**
 * components/views/HelpView.jsx
 * Phase 1: Diagnostics panel + basic troubleshooting.
 * All data is derived from Zustand store state — no invented values.
 */
import React, { useEffect, useState } from 'react';
import { useConnectionStore } from '../../store/slices/connection.js';
import { useTelemetryStore } from '../../store/slices/telemetry.js';
import { Link } from 'react-router-dom';
import { retryConnection } from '../../services/websocket.js';
import {
  getTelemetryFreshness,
  FRESHNESS_LABELS,
  FRESHNESS_COLOR,
} from '../../services/telemetryFreshness.js';

function DiagRow({ label, value, color }) {
  return (
    <div className="diag-row">
      <span className="diag-row__label">{label}</span>
      <span className="diag-row__value" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

function TroubleshootCard({ condition, likely, checks }) {
  return (
    <div className="ts-card">
      <div className="ts-card__condition">⚠️ {condition}</div>
      <div className="ts-card__likely"><strong>Likely cause:</strong> {likely}</div>
      <ul className="ts-card__checks">
        {checks.map((c) => <li key={c}>{c}</li>)}
      </ul>
    </div>
  );
}

export default function HelpView() {
  const status = useConnectionStore((s) => s.status);
  const connectedAt = useConnectionStore((s) => s.connectedAt);
  const reconnectCount = useConnectionStore((s) => s.reconnectCount);
  const lastError = useConnectionStore((s) => s.lastError);
  const telemetry = useTelemetryStore((s) => s.data);

  const [freshness, setFreshness] = useState('UNKNOWN');

  useEffect(() => {
    const id = setInterval(() => {
      setFreshness(getTelemetryFreshness(telemetry.receivedAt));
    }, 1000);
    return () => clearInterval(id);
  }, [telemetry.receivedAt]);

  const hasPosition = telemetry.latitude != null && telemetry.longitude != null;
  const hasAttitude = telemetry.roll != null && telemetry.pitch != null;

  // Rule-based diagnostics
  const issues = [];
  if (status !== 'connected') {
    issues.push({
      condition: 'WebSocket unavailable',
      likely: 'The Node.js bridge (bridge.js) is not running.',
      checks: [
        'Run `npm start` in the project root (inside WSL2 if using SITL there).',
        'Confirm bridge output shows "WebSocket server running on ws://localhost:8080".',
        'Check for port conflicts on 8080.',
      ],
    });
  }
  if (status === 'connected' && freshness !== 'HEALTHY') {
    issues.push({
      condition: `Telemetry ${FRESHNESS_LABELS[freshness].toLowerCase()} (${freshness})`,
      likely: 'Bridge is connected but not receiving MAVLink packets from SITL.',
      checks: [
        'Check that ArduPilot SITL is running.',
        'Check MAVProxy is outputting to 127.0.0.1:14550.',
        'If SITL is in WSL2, confirm bridge.js is also running inside WSL2.',
        'Look for "0 UDP packets received" diagnostic in bridge console output.',
      ],
    });
  }
  if (status === 'connected' && freshness === 'HEALTHY' && !hasPosition) {
    issues.push({
      condition: 'No GPS position data',
      likely: 'GLOBAL_POSITION_INT messages not being received or GPS not yet fixed.',
      checks: [
        'Check bridge console for "GLOBAL_POSITION_INT" in decoded message counts.',
        'Wait for GPS fix — ArduPilot SITL may take a few seconds to produce a valid fix.',
        'Inspect latitude/longitude values — 0.0 may indicate a pre-fix state.',
      ],
    });
  }

  return (
    <div className="help-view">
      <h2 className="view-title">Help &amp; Diagnostics</h2>
      <p className="view-subtitle">All values are derived from observed system state. No fabricated data.</p>
      <div className="workspace-notice">Offline flight needs no backend. Use W/S to climb/descend, A/D to rotate, arrows to move, I for environment settings and M for sound. <Link to="/training">Open training</Link>.</div>
      <div className="workspace-actions"><button className="btn-view" onClick={retryConnection}>Retry bridge connection</button><Link className="btn-view" to="/simulator">Open simulator</Link></div>

      {/* Diagnostics Panel */}
      <section className="help-section">
        <h3 className="help-section__title">System Diagnostics</h3>
        <div className="diag-panel">
          <DiagRow label="WebSocket" value={status.toUpperCase()} color={
            status === 'connected' ? 'var(--accent-green)' :
            status === 'disconnected' ? 'var(--accent-red)' : 'var(--accent-yellow)'
          } />
          <DiagRow label="Connected at" value={connectedAt ?? '—'} />
          <DiagRow label="Reconnects" value={String(reconnectCount)} />
          <DiagRow label="Last WS Error" value={lastError ?? 'None'} />
          <DiagRow
            label="Telemetry freshness"
            value={freshness === 'UNKNOWN' ? 'No data yet' : FRESHNESS_LABELS[freshness]}
            color={FRESHNESS_COLOR[freshness]}
          />
          <DiagRow label="Last update" value={telemetry.receivedIso ?? '—'} />
          <DiagRow label="SITL startup" value="Managed outside the browser" />
          <DiagRow label="GPS position" value={hasPosition ? `${telemetry.latitude?.toFixed(6)}°, ${telemetry.longitude?.toFixed(6)}°` : 'No fix'} />
          <DiagRow label="Attitude" value={hasAttitude ? `R${telemetry.roll?.toFixed(1)}° P${telemetry.pitch?.toFixed(1)}° Y${telemetry.yaw?.toFixed(1)}°` : 'No data'} />
          <DiagRow label="Flight mode" value={telemetry.flightMode ?? '—'} />
        </div>
      </section>

      {/* Active Issues */}
      {issues.length > 0 && (
        <section className="help-section">
          <h3 className="help-section__title">Active Issues ({issues.length})</h3>
          <div className="ts-list">
            {issues.map((issue) => (
              <TroubleshootCard key={issue.condition} {...issue} />
            ))}
          </div>
        </section>
      )}

      {issues.length === 0 && status === 'connected' && freshness === 'HEALTHY' && (
        <section className="help-section">
          <div className="help-all-ok">✅ No active issues detected. All systems nominal.</div>
        </section>
      )}

      {/* Field Reference */}
      <section className="help-section">
        <h3 className="help-section__title">Telemetry Field Reference</h3>
        <table className="help-table">
          <thead>
            <tr><th>Field</th><th>Unit</th><th>Source MAVLink message</th><th>Notes</th></tr>
          </thead>
          <tbody>
            <tr><td>latitude / longitude</td><td>°</td><td>GLOBAL_POSITION_INT</td><td>Decimal degrees, ÷1e7 from raw</td></tr>
            <tr><td>altitude</td><td>m</td><td>GLOBAL_POSITION_INT</td><td>MSL, ÷1000 from raw mm</td></tr>
            <tr><td>relativeAltitude</td><td>m</td><td>GLOBAL_POSITION_INT</td><td>Above home/takeoff point</td></tr>
            <tr><td>groundSpeed</td><td>m/s</td><td>GLOBAL_POSITION_INT</td><td>√(vx²+vy²) ÷100</td></tr>
            <tr><td>batteryVoltage</td><td>V</td><td>SYS_STATUS</td><td>÷1000 from mV</td></tr>
            <tr><td>batteryRemaining</td><td>%</td><td>SYS_STATUS</td><td>0–100</td></tr>
            <tr><td>flightMode</td><td>—</td><td>HEARTBEAT</td><td>custom_mode mapped to name</td></tr>
            <tr><td>roll / pitch / yaw</td><td>°</td><td>ATTITUDE</td><td>Converted from radians</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
