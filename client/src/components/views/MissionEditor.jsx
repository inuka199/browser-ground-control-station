import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMissionStore, validateMission, missionPath } from '../../store/slices/mission.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { downloadFile } from '../../services/flightRecords.js';
export default function MissionEditor() {
  const stored = useMissionStore(s => s.points), [points, setPoints] = useState(stored), [message, setMessage] = useState('');
  const navigate = useNavigate();
  const update = (index, key, value) => setPoints(items => items.map((p, i) => i === index ? { ...p, [key]: value } : p));
  const run = action => { try { const plan = validateMission(points); useMissionStore.getState().save(plan); action(plan); } catch (error) { setMessage(error.message); } };
  return <article className="workspace-card"><h2>Local waypoint planner</h2><p>Coordinates are metres east, south and above the home pad. Preview assumes 10 m/s between waypoints. Plans are saved locally; the bridge does not support mission upload.</p><div className="workspace-table"><table><thead><tr><th>Point</th><th>East (m)</th><th>South (m)</th><th>Altitude (m)</th><th>Action</th></tr></thead><tbody>{points.map((point, index) => <tr key={index}><td>{index + 1}</td>{['x','z','y'].map(key => <td key={key}><input aria-label={'Waypoint ' + (index + 1) + ' ' + ({x:'east',z:'south',y:'altitude'}[key])} type="number" value={point[key]} onChange={e => update(index, key, e.target.value)}/></td>)}<td><button disabled={points.length <= 2} aria-label={'Remove waypoint ' + (index + 1)} onClick={() => setPoints(items => items.filter((_, i) => i !== index))}>Remove</button></td></tr>)}</tbody></table></div><div className="workspace-actions"><button disabled={points.length >= 50} onClick={() => setPoints(items => [...items, {x:0,y:20,z:0}])}>Add waypoint</button><button onClick={() => run(() => setMessage('Plan saved on this device.'))}>Save plan</button><button onClick={() => run(plan => { useSimulatorStore.getState().loadFlownPath(missionPath(plan), 'Waypoint plan', 'plan'); navigate('/environment'); })}>Preview in 3D</button><button onClick={() => run(plan => downloadFile('nexus-mission.json', JSON.stringify({ coordinates:'local-metres-east-up-south', points:plan },null,2)))}>Export plan</button></div>{message && <p role="status">{message}</p>}</article>;
}
