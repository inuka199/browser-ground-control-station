import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { CHALLENGES, useChallengeStore } from '../../store/slices/challenges.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { useTelemetryHealth } from '../../services/useTelemetryHealth.js';
export default function ChallengesView() {
  const { active, results, startChallenge, abortChallenge } = useChallengeStore();
  const navigate = useNavigate(), { fresh } = useTelemetryHealth();
  return <section className="workspace-page"><PageHeader title="Flight challenges">Pick a mission and fly from the home pad. Your results are saved on this device.</PageHeader>
    {fresh && <p className="workspace-notice">Challenges use keyboard flight. Disconnect live telemetry before starting a challenge.</p>}
    {active && <div className="workspace-notice">Active: {CHALLENGES.find(item => item.id === active.id)?.title} · {active.stage}/3 objectives<div className="workspace-actions"><Link className="workspace-button" to="/simulator">Return to flight</Link><button onClick={abortChallenge}>End challenge</button></div></div>}
    <div className="workspace-grid challenge-selection">{CHALLENGES.map(challenge => { const result = results[challenge.id]; return <article key={challenge.id} className="workspace-card"><h2>{challenge.title}</h2><p>{challenge.description}</p><details className="challenge-instructions"><summary>Objectives & controls</summary><ol>{challenge.objectives.map((objective, index) => <li key={objective}><p>{active?.id === challenge.id && active.stage > index ? '✓ ' : ''}{objective}</p></li>)}</ol><p>W/S climb · A/D rotate · arrows fly. Tap T for a locked pursuit target; hold T for 0.5 seconds to detonate your drone. Esc pauses.</p><p>Leaving the simulator ends an unfinished challenge.</p></details>
      {result && <div role="status">Completed · {result.score}/100 · {result.elapsed.toFixed(1)} s · {result.warnings} proximity warnings</div>}
      <div className="workspace-actions"><button disabled={Boolean(active) || fresh} onClick={() => { startChallenge(challenge.id); useSimulatorStore.getState().setTilesEnabled(false); useSimulatorStore.getState().restartDemo(); navigate('/simulator'); }}>{result ? 'Fly again' : 'Start challenge'}</button></div><p className="challenge-score-note">{challenge.arcade ? "100 points for completion · Avoid traffic" : "100 points · −10 per proximity warning"}</p></article>; })}</div>
  </section>;
}
