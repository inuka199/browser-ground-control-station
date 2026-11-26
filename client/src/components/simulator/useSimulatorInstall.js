import { useEffect, useState } from 'react';

export function useSimulatorInstall() {
  const [prompt, setPrompt] = useState(null);
  const [ready, setReady] = useState(false);
  const [update, setUpdate] = useState(false);
  const supported = import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator;
  const [error, setError] = useState(!supported);
  const [installed, setInstalled] = useState(() => window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone);
  useEffect(() => {
    let mounted = true;
    let registration, worker;
    const capture = e => { e.preventDefault(); setPrompt(e); };
    const done = () => { setPrompt(null); setInstalled(true); };
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = '/simulator-pwa/flight.webmanifest';
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    document.head.append(manifest);
    const track = () => {
      if (!mounted) return;
      if (registration.active?.state === 'activated') setReady(true);
      if (registration.waiting && registration.active) setUpdate(true);
      if (worker?.state === 'installed' && registration.active) setUpdate(true);
      if (worker?.state === 'redundant' && !registration.active) setError(true);
    };
    const watch = () => {
      worker?.removeEventListener('statechange', track);
      worker = registration.installing || registration.waiting || registration.active;
      worker?.addEventListener('statechange', track);
      track();
    };
    if (supported) {
      navigator.serviceWorker.register('/simulator-worker.js', { scope: '/', updateViaCache: 'none' })
        .then(reg => {
          if (!mounted) return;
          registration = reg;
          registration.addEventListener('updatefound', watch);
          watch();
        }).catch(() => { if (mounted) setError(true); });
    }
    return () => {
      mounted = false;
      manifest.remove();
      registration?.removeEventListener('updatefound', watch);
      worker?.removeEventListener('statechange', track);
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, [supported]);
  return { ready, installed, update, error, install: prompt && (async () => {
    setPrompt(null);
    await prompt.prompt();
  }) };
}
