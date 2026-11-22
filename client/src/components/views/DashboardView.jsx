import React from 'react';
import { Link } from 'react-router-dom';
import ConnectionStatus from '../ConnectionStatus.jsx';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';


export default function DashboardView() {
  const { data, status, fresh } = useTelemetryHealth();
  const activeMode = fresh && typeof data.flightMode === 'string' ? data.flightMode : '—';

  return <div className="dashboard-view">
    <header className="header"><h1>Nexus GCS</h1><ConnectionStatus status={status}/></header>
    <div className="home-layout">
      <div className="home-main">
        <section className="home-launch">
          <span className="workspace-kicker">YOUR NEXT FLIGHT</span>
          <h2>Take a moment. Take flight.</h2>
          <p>Explore the coast, head to the harbour, or try a challenge.</p>
          <div className="home-actions">
            <Link className="home-primary" to="/simulator?launch=galle-face">Start flying →</Link>
            <Link to="/simulator?launch=port-city">Explore Port City</Link>
            <Link to="/garage">Choose drone</Link>
            <Link to="/challenges">Challenges</Link>
          </div>
        </section>
        <div className="home-shortcuts">
          <Link to="/recordings"><strong>Recordings</strong><span>Replay your flights</span></Link>
          <Link to="/training"><strong>Learn to fly</strong><span>Short guided lessons</span></Link>
          <Link to="/simulation"><strong>Flight setup</strong><span>Sky, sound & connection</span></Link>
        </div>
      </div>
      <aside className="home-live-controls" aria-label="Flight mode controls">
        <div className="home-active-mode"><span>Active Mode</span><strong>{activeMode}</strong></div>
        <Link className="workspace-button" to="/live">Open live station and flight controls</Link>
      </aside>
    </div>
  </div>;
}
