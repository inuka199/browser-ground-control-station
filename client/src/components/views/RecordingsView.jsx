import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { useRecordingStore } from '../../store/slices/recording.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { downloadFile, flightCSV, flightMetrics, validatePath } from '../../services/flightRecords.js';

export default function RecordingsView() {
  const { recordings, lastError, saveFlight, rename } = useRecordingStore();
  const path = useSimulatorStore(s => s.flownPath);
  const model = useSimulatorStore(s => s.droneModelId);
  const source = useSimulatorStore(s => s.recordingSource);
  const routeLabel = useSimulatorStore(s => s.routeLabel);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const replay = record => { useSimulatorStore.getState().loadFlownPath(record.points, record.name, record.source); navigate('/environment'); };
  async function importFlight(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 3000000) throw new Error('Choose a JSON flight file smaller than 3 MB.');
      const record = JSON.parse(await file.text());
      const points = validatePath(record.points);
      if (saveFlight(points, record.modelId, record.source, record.name)) setMessage('Flight imported. Select Replay to inspect it.');
    } catch (error) { setMessage(error.message); }
    event.target.value = '';
  }
  return <section className="workspace-page"><PageHeader title="Flight recordings">Record in the simulator, then replay, rename or export your flights. The latest eight flights are saved on this device.</PageHeader>
    <div className="workspace-actions"><Link className="workspace-button" to="/simulator">Open simulator to record</Link>{path.length > 1 && <button onClick={() => { if (saveFlight(path, model, source, routeLabel)) setMessage('Current route saved to your library.'); }}>Save current route</button>}</div>
    <label>Import a Nexus flight (.json)<input type="file" accept=".json,application/json" onChange={importFlight}/></label>
    {message && <p role="status">{message}</p>}{lastError && <p role="alert">{lastError}</p>}
    {!recordings.length && <div className="workspace-empty"><h2>No saved flights yet</h2><p>Use Record flight in the simulator. Stop recording, or leave the simulator, to save the flight here.</p></div>}
    <div className="workspace-grid">{recordings.map(record => { const stats = flightMetrics(record.points); return <article className="workspace-card" key={record.id}>
      <label>Flight name<input aria-label={'Name for ' + record.name} defaultValue={record.name} maxLength="100" onBlur={event => rename(record.id, event.target.value)}/></label>
      <p>{new Date(record.createdAt).toLocaleString()} · {record.source === 'live' ? 'Live telemetry' : record.source === 'plan' ? 'Waypoint plan' : 'Offline simulation'}</p>
      <dl><div><dt>Duration</dt><dd>{stats.duration.toFixed(1)} s</dd></div><div><dt>Distance</dt><dd>{stats.distance.toFixed(1)} m</dd></div><div><dt>Peak altitude</dt><dd>{stats.peak.toFixed(1)} m</dd></div><div><dt>Samples</dt><dd>{record.points.length}</dd></div></dl>
      <div className="workspace-actions"><button onClick={() => replay(record)}>Replay</button><button onClick={() => downloadFile(record.id + '.json', JSON.stringify(record, null, 2))}>Export JSON</button><button onClick={() => downloadFile(record.id + '.csv', flightCSV(record.points), 'text/csv')}>Export CSV</button></div>
    </article>; })}</div>
  </section>;
}
