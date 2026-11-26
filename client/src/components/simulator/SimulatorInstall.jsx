import React from 'react';

export default function SimulatorInstall({ state }) {
  if (!state) return null;
  const { ready, installed, update, error, install } = state;
  return <div className="flight-install"><strong>{ready ? 'Ready for offline flight' : error ? 'Offline installation unavailable' : 'Saving game for offline flight…'}</strong>
    {update && <p>Update downloaded. Finish your challenge, then close all tabs for this site and reopen the game.</p>}
    {error ? <p>Open the production game over HTTPS to install it.</p> :
      !installed && (install ? <button onClick={install}>Install simulator</button> :
        <p>Use Install app or Add to Home Screen in your browser menu. On iPhone, open Safari’s Share menu.</p>)}
  </div>;
}
