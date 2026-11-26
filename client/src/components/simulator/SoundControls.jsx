import React from 'react';
import { useAudioStore } from '../../store/slices/audio.js';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { enableFlightAudio } from './flightAudio.js';

export default function SoundControls({ compact = false, minimal = false }) {
  const { muted, volume, status, toggleMuted, setVolume } = useAudioStore();
  const paused = useSimulatorStore(state => state.isPaused);
  const active = status === 'running';
  const label = muted ? 'Unmute sound' : active ? 'Mute sound' : 'Enable sound';
  const toggle = () => {
    if (active || muted) toggleMuted();
    void enableFlightAudio();
  };
  const button = <button data-sound-toggle className={compact ? 'hud-fcp-btn' : 'sound-toggle'} onClick={toggle} aria-label={label} title={`${label} [M]`}>
    <span aria-hidden="true">{muted || volume === 0 ? '🔇' : '🔊'}</span> {muted ? 'Muted' : active ? 'Sound on' : 'Enable sound'}
  </button>;
  if (compact) return button;
  const volumeControl = <label className="environment-range"><span>Volume <output>{Math.round(volume * 100)}%</output></span>
    <input aria-label="Sound volume" type="range" min="0" max="1" step="0.05" value={volume} onChange={event => { setVolume(Number(event.target.value)); void enableFlightAudio(); }}/>
  </label>;
  if (minimal) return <div className="pause-audio">
    <label><span>Sound</span><input type="checkbox" data-sound-toggle checked={!muted}
      onChange={() => { toggleMuted(); void enableFlightAudio(); }}/></label>
    {status === 'unavailable' && <p role="status">Audio unavailable</p>}
    {volumeControl}
  </div>;
  return <section className="sound-settings" aria-label="Sound settings">
    <div className="sound-heading"><span>SOUNDS OF FLIGHT</span><kbd>M</kbd></div>
    <div className="sound-state">{button}<span role="status">{status === 'unavailable' ? 'Audio unavailable' : muted || volume === 0 ? 'Muted' : paused ? 'Paused' : active ? 'Audio active' : 'Ready on interaction'}</span></div>
    {volumeControl}
    <p>Rolling waves, wind and city traffic. Harbour sounds near the port, birds by day and crickets at night.</p>
  </section>;
}
