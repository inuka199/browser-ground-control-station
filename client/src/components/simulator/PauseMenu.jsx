import React, { useLayoutEffect, useRef, useState } from 'react';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { useChallengeStore } from '../../store/slices/challenges.js';
import EnvironmentControls from './EnvironmentControls.jsx';
import SimulatorInstall from './SimulatorInstall.jsx';
import SoundControls from './SoundControls.jsx';
import './PauseMenu.css';

const KEY_BINDINGS = [
  ['W / S', 'Climb / descend'], ['A / D', 'Turn left / right'],
  ['↑ / ↓', 'Fly forward / backward'], ['← / →', 'Fly sideways'],
  ['1–5 / C', 'Select / cycle camera'], ['Esc', 'Pause / resume'],
  ['H / G', 'Toggle HUD / control guide'], ['M', 'Mute / unmute'],
  ['I / F', 'Environment / flight controls'], ['B', 'Toggle 3D tiles'],
  ['T', 'Tap for target action. Hold for drone detonation.'],
];

function KeyboardGuide() {
  return <details className="pause-section">
    <summary>Keyboard shortcuts</summary>
    <dl className="pause-bindings">{KEY_BINDINGS.map(([keys, action]) =>
      <div key={keys}><dt><kbd>{keys}</kbd></dt><dd>{action}</dd></div>
    )}</dl>
  </details>;
}

function TouchGuide() {
  return <dl className="pause-thumb-guide">
    <div><dt>Left stick</dt><dd>Up to take off or climb, down to land. Left or right to turn.</dd></div>
    <div><dt>Right stick</dt><dd>Move in any direction. Release both sticks to hover.</dd></div>
  </dl>;
}

export default function PauseMenu({ onResume, onExit, touch, firstTouch, starting, rotate, installState }) {
  const dialog = useRef(null);
  const primary = useRef(null);
  const [confirmDetonation, setConfirmDetonation] = useState(false);
  const isHudVisible = useSimulatorStore(s => s.isHudVisible);
  const isGuideVisible = useSimulatorStore(s => s.isGuideVisible);
  const { toggleHud, toggleGuide } = useSimulatorStore.getState();

  useLayoutEffect(() => {
    const panel = dialog.current;
    if (panel.showModal) panel.showModal();
    else panel.open = true;
    primary.current.focus({ preventScroll: true });
    return () => panel.close?.();
  }, []);

  const showFirstGuide = firstTouch && !rotate;
  const title = rotate ? 'Rotate your phone to play' : starting || showFirstGuide ? 'Ready to fly' : 'Paused';
  const action = starting ? 'Start flight' : rotate ? 'Try landscape' : 'Resume';

  return <dialog ref={dialog} className="flight-pause" aria-label="Pause menu" onCancel={event => {
    event.preventDefault();
    if (!touch) onResume();
  }}>
    <div className="pause-layout">
      <div className="pause-main">
        <header>
          <p className="pause-context">Nexus <span aria-hidden="true">/</span> Offline simulator</p>
          <h2 className={rotate ? 'rotate-title' : undefined}>{title}</h2>
          {rotate && <p className="pause-hint">Turn your phone sideways, then tap Resume.</p>}
        </header>
        {showFirstGuide && <TouchGuide/>}
        <div className="pause-navigation">
          <button ref={primary} id="pause-resume-btn" className="pause-primary" onClick={onResume}>{action}</button>
          <button id="pause-exit-btn" className="pause-exit" onClick={onExit} aria-label={navigator.onLine ? 'Back to GCS Dashboard' : 'Exit to garage'}>{navigator.onLine ? 'Dashboard' : 'Garage'}</button>
        </div>
      </div>

      <div className="pause-options">
        <details className="pause-section">
          <summary>Display &amp; sound</summary>
          <div className="pause-preferences">
            <label><span>Flight HUD</span><input type="checkbox" checked={isHudVisible} onChange={toggleHud}/></label>
            {!touch && <label><span>Control guide</span><input type="checkbox" checked={isGuideVisible} onChange={toggleGuide}/></label>}
            <SoundControls minimal/>
          </div>
        </details>
        {rotate && <EnvironmentControls compact includeSound={false}/>}
        {touch && !showFirstGuide && <details className="pause-section">
          <summary>Controls</summary><TouchGuide/><KeyboardGuide/>
        </details>}
        {(!touch || showFirstGuide) && <KeyboardGuide/>}
        {touch && !firstTouch && !rotate && <details className="pause-section"
          onToggle={event => { if (!event.currentTarget.open) setConfirmDetonation(false); }}>
          <summary>Flight actions</summary>
          <div className="pause-tools">
            <button onClick={() => {
              const challenge = useChallengeStore.getState();
              if (challenge.active) challenge.startChallenge(challenge.active.id);
              useSimulatorStore.getState().restartDemo({ paused: true });
            }}>Restart at launch point</button>
            <button onClick={() => {
              if (!confirmDetonation) { setConfirmDetonation(true); return; }
              useSimulatorStore.getState().detonateDemo();
              setConfirmDetonation(false);
            }}>{confirmDetonation ? 'Confirm drone detonation' : 'Detonate simulated drone'}</button>
          </div>
        </details>}
        <SimulatorInstall state={installState}/>
      </div>
    </div>
  </dialog>;
}
