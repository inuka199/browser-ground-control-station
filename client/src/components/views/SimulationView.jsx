import React from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import EnvironmentControls from '../simulator/EnvironmentControls.jsx';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';
import { retryConnection } from '../../services/websocket.js';
export default function SimulationView() {
  const { data, status, fresh } = useTelemetryHealth();
  return <section className="workspace-page"><PageHeader title="Simulation control center">Launch offline flight or inspect your live bridge connection.</PageHeader><div className="workspace-grid">
    <article className="workspace-card"><h2>Offline coastal flight</h2><p>The browser simulator is ready without a backend. Choose an aircraft and explore the city with touch sticks or a keyboard.</p><div className="workspace-actions"><Link className="workspace-button" to="/simulator">Continue flight</Link><Link className="workspace-button" to="/garage">Choose aircraft</Link><Link className="workspace-button" to="/simulator?launch=galle-face">Launch simulator</Link></div><p>W/S climb and descend · A/D rotate · arrows move · Esc pauses.</p></article>
    <article className="workspace-card"><h2>Live ArduPilot connection</h2><dl><div><dt>Bridge</dt><dd>{status}</dd></div><div><dt>Telemetry</dt><dd>{fresh ? 'Receiving fresh data' : 'No fresh data'}</dd></div><div><dt>Flight mode</dt><dd>{fresh ? data.flightMode || 'Unknown' : '—'}</dd></div></dl><button onClick={retryConnection}>Retry connection</button><p>SITL runs separately. This page reports the connection; it cannot start or stop an ArduPilot process.</p><Link className="workspace-button" to="/help">Setup and diagnostics</Link></article>
    <article className="workspace-card"><h2>Port City & marina</h2><p>Explore the reclaimed waterfront: stepped towers, marina berths, container ships and animated harbour cranes. The ocean follows the wind, sunlight and moonlight.</p><Link className="workspace-button" to="/simulator?launch=port-city">Explore Port City</Link><p>Northwest of Galle Face · Offline coastal district</p></article>
    <article className="workspace-card"><h2>Tideline · Beacon Patrol</h2><p>Survey three beacons and bring your drone back to the jetty. Play with touch controls and save the game on your phone.</p><a className="workspace-button" href="/tideline/index.html">Play Tideline</a></article>
    <article className="workspace-card"><h2>World settings</h2><EnvironmentControls/></article>
    <article className="workspace-card"><h2>Plan your session</h2><p>Set your camera, practice a challenge, or review your previous flight.</p><div className="workspace-actions"><Link className="workspace-button" to="/views">Camera & display</Link><Link className="workspace-button" to="/challenges">Challenges</Link><Link className="workspace-button" to="/recordings">Recordings</Link></div></article>
  </div></section>;
}
