/**
 * simulator/PauseMenu.jsx
 *
 * Full-screen pause overlay with:
 *  - Resume button
 *  - Settings panel (HUD, control guide, FPV sensitivity note)
 *  - Keyboard reference card
 *  - Clear "pause ≠ SITL stopped" disclaimer
 */
import React from 'react';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { useConnectionStore } from '../../store/slices/connection.js';
import SoundControls from './SoundControls.jsx';

const KEY_BINDINGS = [
  { key: 'Esc',   action: 'Pause / Resume' },
  { key: 'H',     action: 'Toggle HUD & controls' },
  { key: 'G',     action: 'Toggle control guide' },
  { key: 'A / D', action: 'Rotate left / right' },
  { key: '↑ / ↓', action: 'Fly forward / back · nose down / up' },
  { key: 'I',     action: 'Environment settings' },
  { key: 'M',     action: 'Mute / unmute sound' },
  { key: '1–5',   action: 'Camera: Chase / FPV / Top / Side / Free' },
  { key: 'C',     action: 'Cycle camera mode' },
  { key: 'T',     action: 'Hold 0.5s: detonate drone · tap: locked target' },
  { key: 'B',     action: 'Toggle 3D tiles' },
];

export default function PauseMenu({ onResume, onExit }) {
  const isHudVisible   = useSimulatorStore((s) => s.isHudVisible);
  const isGuideVisible = useSimulatorStore((s) => s.isGuideVisible);
  const connStatus     = useConnectionStore((s) => s.status);
  const isConnected    = connStatus === 'connected';

  const { toggleHud, toggleGuide } = useSimulatorStore.getState();

  return (
    <div className="pause-overlay" role="dialog" aria-modal="true" aria-label="Pause menu">
      <div className="pause-panel">

        {/* Logo / title */}
        <div className="pause-logo">
          <span className="pause-logo-icon">✈</span>
          <span className="pause-logo-name">Nexus Flight Sim</span>
        </div>
        <p className="pause-subtitle">Paused</p>

        {/* SITL disclaimer */}
        <div className="pause-sitl-notice">
          <span className="pause-notice-icon">ℹ️</span>
          <p>
            {isConnected
              ? 'The 3D view is paused. The ArduPilot SITL simulation continues running independently — telemetry is still being received.'
              : 'Running in demo mode. Connect the bridge and ArduPilot SITL to fly with real vehicle dynamics.'}
          </p>
        </div>

        {/* Action buttons */}
        <div className="pause-actions">
          <button id="pause-resume-btn" className="pause-btn pause-btn--primary" onClick={onResume}>
            ▶ Resume
          </button>
          <button id="pause-exit-btn" className="pause-btn pause-btn--secondary" onClick={onExit}>
            ← Back to GCS Dashboard
          </button>
        </div>

        {/* Settings */}
        <div className="pause-settings">
          <h4 className="pause-settings-title">Display Settings</h4>
          <label className="pause-toggle-row">
            <span>Flight HUD</span>
            <button
              className={`pause-toggle ${isHudVisible ? 'pause-toggle--on' : ''}`}
              onClick={toggleHud}
              aria-pressed={isHudVisible}
            >
              {isHudVisible ? 'ON' : 'OFF'}
            </button>
          </label>
          <label className="pause-toggle-row">
            <span>Control Guide</span>
            <button
              className={`pause-toggle ${isGuideVisible ? 'pause-toggle--on' : ''}`}
              onClick={toggleGuide}
              aria-pressed={isGuideVisible}
            >
              {isGuideVisible ? 'ON' : 'OFF'}
            </button>
          </label>
        </div>

        <SoundControls />

        {/* Keyboard reference */}
        <details className="pause-keys">
          <summary className="pause-settings-title">Keyboard shortcuts</summary>
          <div className="pause-keys-grid">
            {KEY_BINDINGS.map(({ key, action }) => (
              <React.Fragment key={key}>
                <kbd className="pause-kbd">{key}</kbd>
                <span className="pause-key-action">{action}</span>
              </React.Fragment>
            ))}
          </div>
        </details>

      </div>
    </div>
  );
}
