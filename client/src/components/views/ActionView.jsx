import React, { useState } from 'react';
import PageHeader from './PageHeader.jsx';
import MissionEditor from './MissionEditor.jsx';
import { Link } from 'react-router-dom';
import { useCommandStore } from '../../store/slices/commands.js';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';
export default function ActionView() {
  const [tab, setTab] = useState('commands');
  const history = useCommandStore(s => s.history);
  const { status, fresh, data } = useTelemetryHealth();
  return <section className="workspace-page"><PageHeader title="Action & mission control">Live vehicle commands, local waypoint planning and observed command results.</PageHeader>
    <div className="workspace-actions" role="tablist" aria-label="Action tools">{[['commands','Flight commands'],['mission','Mission planner'],['events','Status & events']].map(([id,label]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)}>{label}</button>)}</div>
    <div style={{marginTop:20}} role="tabpanel">{tab === 'commands' ? <div className="action-control-embed"><Link to="/live" className="workspace-button">Open live station and flight controls</Link></div> : tab === 'mission' ? <MissionEditor/> : <div className="workspace-stack"><article className="workspace-card"><h2>Observed status</h2><dl><div><dt>Bridge</dt><dd>{status}</dd></div><div><dt>Telemetry</dt><dd>{fresh ? 'Fresh' : 'Unavailable or stale'}</dd></div><div><dt>Battery</dt><dd>{fresh && data.batteryRemaining != null ? data.batteryRemaining + '%' : '—'}</dd></div></dl>{fresh && data.batteryRemaining != null && data.batteryRemaining <= 20 && <p role="alert">Low battery reported by the vehicle.</p>}<p>See the live station for fence, failsafe settings and autopilot warnings.</p></article><article className="workspace-card"><h2>Command results</h2>{history.length ? <div className="workspace-table"><table><thead><tr><th>Time</th><th>Command</th><th>Result</th></tr></thead><tbody>{history.map((event,index) => <tr key={index}><td>{event.time}</td><td>{event.label}</td><td>{event.status}</td></tr>)}</tbody></table></div> : <p>No commands sent in this session.</p>}</article></div>}</div>
  </section>;
}
