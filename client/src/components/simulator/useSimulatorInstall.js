import { useCallback, useEffect, useRef, useState } from 'react';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { useChallengeStore } from '../../store/slices/challenges.js';

const manifestPath = '/simulator-pwa/flight.webmanifest';
const standalone = () => Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone);
const safeToReload = () => useSimulatorStore.getState().isPaused && !useSimulatorStore.getState().isRecording && !useChallengeStore.getState().active;

function askWorker(worker, action) {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const finish = (fn, value) => {
      clearTimeout(timer);
      channel.port1.close();
      fn(value);
    };
    const timer = setTimeout(() => finish(reject, Error('Worker did not respond')), action === 'REPAIR' ? 120000 : 8000);
    channel.port1.onmessage = event => finish(resolve, event.data);
    try { worker.postMessage(action, [channel.port2]); }
    catch (error) { finish(reject, error); }
  });
}

export function useSimulatorInstall() {
  const supported = import.meta.env.PROD && window.isSecureContext && 'serviceWorker' in navigator;
  const [status, setStatus] = useState(supported ? 'downloading' : 'unavailable');
  const [installed, setInstalled] = useState(standalone);
  const [prompt, setPrompt] = useState(null);
  const [update, setUpdate] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const registration = useRef(null);
  const requested = useRef(false);

  useEffect(() => {
    let mounted = true;
    let reg, observed, sequence = 0;
    const capture = event => { event.preventDefault(); setPrompt(event); };
    const done = () => { setPrompt(null); setInstalled(true); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', done);
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.crossOrigin = 'use-credentials';
    manifest.href = manifestPath;
    document.head.append(manifest);
    if (navigator.getInstalledRelatedApps) {
      navigator.getInstalledRelatedApps().then(apps => {
        if (mounted && apps.some(app => app.platform === 'webapp' && app.url === manifest.href)) done();
      }).catch(() => {});
    }

    const refresh = async () => {
      if (!mounted || !reg) return;
      const current = ++sequence;
      const active = reg.active;
      setUpdate(Boolean(reg.waiting && active));
      if (observed?.state === 'redundant') {
        if (active) setNotice('The update download failed. Reopen online to try again.');
        else setStatus('failed');
      }
      if (active?.state !== 'activated') return;
      try {
        let result = await askWorker(active, 'CHECK');
        if (result === 'INCOMPLETE' && attempt > 0 && mounted && current === sequence)
          result = await askWorker(active, 'REPAIR');
        if (mounted && current === sequence) setStatus(result === 'COMPLETE' ? 'ready' : 'failed');
      } catch {
        if (mounted && current === sequence) setStatus('failed');
      }
    };
    const watch = () => {
      observed?.removeEventListener('statechange', refresh);
      observed = reg.installing || reg.waiting || reg.active;
      observed?.addEventListener('statechange', refresh);
      void refresh();
    };
    const controllerChanged = () => {
      if (requested.current && safeToReload()) window.location.replace('/simulator');
      else if (requested.current) setNotice('The update is available on your next launch.');
      requested.current = false;
      void refresh();
    };
    if (supported) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChanged);
      navigator.serviceWorker.register('/simulator-worker.js', {scope: '/', updateViaCache: 'none'})
        .then(result => {
          if (!mounted) return;
          reg = result;
          registration.current = reg;
          reg.addEventListener('updatefound', watch);
          watch();
          if (attempt > 0) reg.update().catch(() => { if (mounted) setNotice('Update check failed. Try again online.'); });
        }).catch(() => { if (mounted) setStatus('failed'); });
    }
    return () => {
      mounted = false;
      registration.current = null;
      requested.current = false;
      observed?.removeEventListener('statechange', refresh);
      reg?.removeEventListener('updatefound', watch);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChanged);
      manifest.remove();
      window.removeEventListener('beforeinstallprompt', capture);
      window.removeEventListener('appinstalled', done);
    };
  }, [supported, attempt]);

  const activate = useCallback(async () => {
    const worker = registration.current?.waiting;
    if (!worker || requested.current) return;
    if (!safeToReload()) { setNotice('Finish the challenge or recording, then pause to update.'); return; }
    requested.current = true;
    try {
      const result = await askWorker(worker, 'ACTIVATE');
      if (result === 'ACTIVATING') return;
      setNotice(result === 'OTHER_TABS' ? 'Close other tabs or windows for this site, then tap Update game.' : 'Reopen the game to apply this update.');
    } catch { setNotice('Close all game windows and reopen to apply the update.'); }
    requested.current = false;
  }, []);
  return { status, installed, update, notice, activate,
    retry: () => { setNotice(''); setStatus('downloading'); setAttempt(value => value + 1); },
    install: prompt && (async () => {
      setPrompt(null);
      try { await prompt.prompt(); await prompt.userChoice; }
      catch { setNotice('Use your browser menu to install the game.'); }
    }),
  };
}
