import React, { useState } from 'react';

function installationHelp() {
  const ua = navigator.userAgent;
  const iphone = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (iphone) return 'In Safari, tap Share, then Add to Home Screen. Enable Open as Web App if shown, then tap Add.';
  if (/Android/.test(ua)) return 'In Chrome, open the menu beside the address bar. Choose Install app, or Install and create shortcut, then Install.';
  return 'Use the install icon in the address bar or the app installation option in your browser menu.';
}

export default function SimulatorInstall({ state }) {
  const [help, setHelp] = useState(false);
  if (!state) return null;
  const {status, installed, install, retry, update, activate, notice} = state;
  const labels = {ready: 'Ready for offline play', downloading: 'Preparing offline game…',
    unavailable: 'Offline installation unavailable', failed: 'Offline download could not be verified'};
  return <section className="flight-install" aria-label="Game installation">
    {installed ? <strong>Game installed</strong> : <button onClick={install || (() => setHelp(true))}>Install game</button>}
    {help && !installed && !install && <p>{installationHelp()}</p>}
    <p role="status">{labels[status]}</p>
    {status === 'unavailable' && <p>Open the published game over HTTPS in your browser.</p>}
    {status === 'failed' && <><p>Connect to the internet and check that your browser has space for the game.</p>
      <button onClick={retry}>Retry download</button></>}
    {update && <button onClick={activate}>Update game</button>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
