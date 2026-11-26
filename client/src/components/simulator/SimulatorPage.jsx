/**
 * simulator/SimulatorPage.jsx — Stage 1–4
 *
 * Full-screen flight simulator page (mounted outside AppShell).
 *
 * Controls (optimized):
 *  - Esc:     Pause / Resume
 *  - H:       Toggle HUD
 *  - G:       Toggle guide
 *  - F:       Toggle Flight Control Panel
 *  - T:       Detonate a locked pursuit target
 *  - B:       Toggle 3D Tiles / Procedural
 *  - C:       Cycle camera mode
 *  - 1–5:     Select camera directly
 *  - W/S:     Throttle up / down (demo visual)
 *  - A/D:     Yaw left / right
 *  - ↑/↓:     Fly forward/back; tilt nose down/up (demo visual)
 *  - ←/→:     Roll left / right (demo visual)
 */
import React, { useEffect, useLayoutEffect, useCallback, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { prepareFlightLaunch } from './flightLaunch.js';
import SimulatorWorld      from './SimulatorWorld.jsx';
import { useSimulatorInstall } from './useSimulatorInstall.js';
import TouchFlight from './TouchFlight.jsx';
import { createLandscapeSession, portraitQuery, portraitViewport } from './landscapeSession.js';
import { wantsTouchFlight, touchFlightQuery, readPreference, writePreference, readFlightPosition } from './mobileFlight.js';
import './TouchFlight.css';
import GameHUD             from './GameHUD.jsx';
import PauseMenu           from './PauseMenu.jsx';
import { useSimulatorStore } from '../../store/slices/simulator.js';
import { demoInput }        from './demoInput.js';
import { FLIGHT_KEYS, flightAxes } from './flightKeys.js';
import { useChallengeStore } from '../../store/slices/challenges.js';
import { enableFlightAudio, playFlightEffect, stopFlightAudio } from './flightAudio.js';
import { useAudioStore } from '../../store/slices/audio.js';
import ChallengeOverlay from './ChallengeOverlay.jsx';
import { createHoldAction } from './holdAction.js';

// ── Control guide data ─────────────────────────────────────────────────────────

const GUIDE_ROWS = [
  { key: 'W / S',    desc: 'Throttle up / down' },
  { key: 'A / D',    desc: 'Rotate left / right' },
  { key: '↑ / ↓',   desc: 'Fly fwd / back · nose down / up' },
  { key: '← / →',   desc: 'Roll left / right' },
  { key: 'F',        desc: 'Flight controls panel' },
  { key: 'I',        desc: 'Sky & environment settings' },
  { key: 'M',        desc: 'Mute / unmute sound' },
  { key: 'C',        desc: 'Cycle camera mode' },
  { key: '1–5',      desc: 'Select camera directly' },
  { key: 'T · 0.5s', desc: 'Hold to detonate drone · tap target' },
  { key: 'B',        desc: 'Toggle 3D Tiles / Procedural' },
  { key: 'H',        desc: 'Hide HUD & controls' },
  { key: 'Esc',      desc: 'Pause / Resume' },
];

function ControlGuide() {
  const isGuideVisible = useSimulatorStore((s) => s.isGuideVisible);
  const isHudVisible = useSimulatorStore((s) => s.isHudVisible);
  if (!isHudVisible) return null;
  if (!isGuideVisible) return <button className="flight-guide-toggle" onClick={()=>useSimulatorStore.getState().toggleGuide()}>Keyboard controls · G</button>;
  return (
    <div className="sim-control-guide" aria-label="Keyboard guide">
      <div className="sim-guide-header">Keyboard controls <button aria-label="Close keyboard guide" onClick={()=>useSimulatorStore.getState().toggleGuide()}>×</button></div>
      {GUIDE_ROWS.map((r) => (
        <div key={r.key} className="sim-guide-row">
          <span className="sim-guide-key">{r.key}</span>
          <span className="sim-guide-desc">{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SimulatorPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const installState = useSimulatorInstall();
  const destination = searchParams.get('launch');
  const [touch, setTouch] = useState(wantsTouchFlight);
  const [needsGuide, setNeedsGuide] = useState(() => !readPreference('nexus-touch-guide-v1'));
  const touchAxes = useRef({});
  const setTouchAxes = useCallback((horizontal, vertical, x, y) => {
    touchAxes.current[horizontal] = x;
    touchAxes.current[vertical] = y;
  }, []);
  const [saved] = useState(() => !destination && !useChallengeStore.getState().active && readFlightPosition());
  const pageRef = useRef(null);
  const landscapeSession = useRef(null);
  const [portrait, setPortrait] = useState(portraitViewport);
  const [starting, setStarting] = useState(!saved);
  const isDestroyed = useSimulatorStore(s => s.isDestroyed);
  useEffect(() => {
    const media = window.matchMedia?.(touchFlightQuery);
    const update = () => setTouch(wantsTouchFlight());
    media?.addEventListener?.('change', update);
    return () => media?.removeEventListener?.('change', update);
  }, []);
  // Apply launch intent before SimulatorWorld's effect initializes its spawn/camera.
  useLayoutEffect(() => {
    if (destination === 'live') { navigate('/live', {replace: true}); return; }
    const sim = useSimulatorStore.getState();
    sim.setFlightSource('demo');
    prepareFlightLaunch(destination);
    if (saved && !destination) {
      sim.setLaunchPoint(saved.launchPoint);
      sim.setPaused(true);
    }
  }, [destination, navigate, saved]);
  useLayoutEffect(() => {
    if (!touch) return;
    useSimulatorStore.getState().setPaused(true);
    const session = createLandscapeSession(pageRef.current);
    landscapeSession.current = session;
    return () => { session.dispose(); landscapeSession.current = null; };
  }, [touch, destination]);

  const isPaused   = useSimulatorStore((s) => s.isPaused);
  const isHudVisible = useSimulatorStore(s => s.isHudVisible);
  const cameraMode = useSimulatorStore((s) => s.cameraMode);
  const { togglePaused, setPaused, toggleHud, toggleGuide, setCameraMode, toggleTiles } =
    useSimulatorStore.getState();

  const [fcpOpen, setFcpOpen] = useState(false);

  // Track which keys are currently held (for smooth input)
  const keysRef = useRef(new Set());
  const nextDetonationBeepAt = useRef(0);
  const [holdAction] = useState(() => createHoldAction(
    () => useSimulatorStore.getState().detonateDemo(),
    () => useChallengeStore.getState().triggerAction(),
    500,
  ));

  // ── Prevent page scroll while simulator is focused ──────────────────────────
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Continuous input update (runs every rAF when keys are held) ────────────
  useEffect(() => {
    const RATE = 0.06;  // how fast the value approaches 1 per frame

    let rafId;
    const clearInput = () => {
      keysRef.current.clear();
      touchAxes.current = {};
      holdAction.cancel();
      nextDetonationBeepAt.current = 0;
      Object.keys(demoInput).forEach((key) => { demoInput[key] = 0; });
    };
    const onBlur = () => { clearInput(); stopFlightAudio(); setPaused(true); };
    const onBackground = () => {
      onBlur();
      const simulator = useSimulatorStore.getState();
      if (simulator.isRecording) simulator.stopRecording();
    };
    const onVisibilityChange = () => { if (document.hidden) onBackground(); };
    let lastPortrait = portraitViewport();
    const onRotate = () => {
      lastPortrait = portraitViewport();
      setPortrait(lastPortrait);
      if (wantsTouchFlight()) { onBlur(); setStarting(false); }
    };
    const onResize = () => { if (lastPortrait !== portraitViewport()) onRotate(); };
    const orientation = window.matchMedia?.(portraitQuery);
    orientation?.addEventListener?.('change', onRotate);
    window.screen?.orientation?.addEventListener?.('change', onRotate);
    window.addEventListener('orientationchange', onRotate);
    window.addEventListener('resize', onResize);
    window.addEventListener('pagehide', onBackground);
    const onFormFocus = (event) => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName) || event.target.isContentEditable) clearInput(); };
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focusin', onFormFocus);
    let lastTime = performance.now();
    const tick = () => {
      const now = performance.now();
      const blend = 1 - Math.pow(1 - RATE, Math.min(now - lastTime, 50) / (1000 / 60));
      lastTime = now;
      if (useSimulatorStore.getState().isPaused || useSimulatorStore.getState().isDestroyed) clearInput();
      const detonationProgress = holdAction.tick(now);
      if (detonationProgress > 0 && detonationProgress < 1 && !useSimulatorStore.getState().isPaused) {
        if (now >= nextDetonationBeepAt.current) {
          playFlightEffect('detonation-warning', 0, { progress: detonationProgress });
          nextDetonationBeepAt.current = now + 200 - detonationProgress * 130;
        }
      } else {
        nextDetonationBeepAt.current = 0;
      }
      const axes = flightAxes(keysRef.current);
      for (const axis of Object.keys(axes)) {
        axes[axis] = Math.max(-1, Math.min(1, axes[axis] + (touchAxes.current[axis] || 0)));
      }
      const lerp = (cur, tgt) => cur + (tgt - cur) * blend;

      demoInput.throttle = lerp(
        demoInput.throttle,
        axes.throttle,
      );
      demoInput.yaw = lerp(
        demoInput.yaw,
        axes.yaw,
      );
      demoInput.pitch = lerp(
        demoInput.pitch,
        axes.pitch,
      );
      demoInput.roll = lerp(
        demoInput.roll,
        axes.roll,
      );

      // Snap to zero when very small
      if (Math.abs(demoInput.throttle) < 0.01) demoInput.throttle = 0;
      if (Math.abs(demoInput.yaw)      < 0.01) demoInput.yaw      = 0;
      if (Math.abs(demoInput.pitch)    < 0.01) demoInput.pitch    = 0;
      if (Math.abs(demoInput.roll)     < 0.01) demoInput.roll     = 0;

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      orientation?.removeEventListener?.('change', onRotate);
      window.screen?.orientation?.removeEventListener?.('change', onRotate);
      window.removeEventListener('orientationchange', onRotate);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('pagehide', onBackground);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focusin', onFormFocus);
      clearInput();
      setPaused(false);
    };
  }, [setPaused, holdAction]);

  // ── Global keyboard handler ─────────────────────────────────────────────────
  const handleKeyDown = useCallback((e) => {
    // Don't intercept when focus is in a form element
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) return;

    // Flight / movement keys — track for continuous input
    if (FLIGHT_KEYS.includes(e.code)) {
      e.preventDefault();
      enableFlightAudio();
      if (!useSimulatorStore.getState().isPaused && !useSimulatorStore.getState().isDestroyed) keysRef.current.add(e.code);
      return;
    }

    if (e.repeat) return;
    switch (e.code) {
      case 'Escape':
        e.preventDefault();
        void enableFlightAudio();
        if (touch) setPaused(true);
        else togglePaused();
        break;
      case 'KeyM':
        e.preventDefault();
        useAudioStore.getState().toggleMuted();
        void enableFlightAudio();
        break;
      case 'KeyH':
        toggleHud();
        break;
      case 'KeyG':
        toggleGuide();
        break;
      case 'KeyF':
        setFcpOpen((v) => !v);
        break;
      case 'KeyT':
        e.preventDefault();
        void enableFlightAudio();
        if (!useSimulatorStore.getState().isPaused && !useSimulatorStore.getState().isDestroyed) holdAction.begin(performance.now());
        break;
      case 'KeyB':
        if (!useChallengeStore.getState().active) toggleTiles();
        break;
      case 'KeyC': {
        const modes = ['chase', 'fpv', 'top', 'side', 'free'];
        const next = modes[(modes.indexOf(cameraMode) + 1) % modes.length];
        setCameraMode(next);
        break;
      }
      case 'Digit1': setCameraMode('chase'); break;
      case 'Digit2': setCameraMode('fpv');   break;
      case 'Digit3': setCameraMode('top');   break;
      case 'Digit4': setCameraMode('side');  break;
      case 'Digit5': setCameraMode('free');  break;
      default: break;
    }
  }, [touch, setPaused, cameraMode, togglePaused, toggleHud, toggleGuide, setCameraMode, toggleTiles, holdAction]);

  const handleKeyUp = useCallback((e) => {
    keysRef.current.delete(e.code);
    if (e.code === 'KeyT') {
      holdAction.release(performance.now());
      nextDetonationBeepAt.current = 0;
    }
  }, [holdAction]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup',   handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup',   handleKeyUp);
    };
  }, [handleKeyDown, handleKeyUp]);

  const handleExit = () => {
    setPaused(false);
    navigate('/');
  };

  return (
    <div ref={pageRef} className={touch ? "simulator-page touch-flight" : "simulator-page"} aria-label="Flight Simulator" onPointerDownCapture={event => { if (!event.target.closest('[data-sound-toggle]')) void enableFlightAudio(); }}>

      {/* ── 3D World ── */}
      <SimulatorWorld savedFlight={saved?.flight} />

      <div hidden={touch && (portrait || isPaused)}>
        {/* ── HUD layer ── */}
        <GameHUD touch={touch}
          onPause={() => setPaused(true)}
          fcpOpen={fcpOpen}
          onToggleFcp={() => setFcpOpen((v) => !v)}
        />

        {/* ── Flight Control Panel (slide-out drawer) ── */}
        {fcpOpen && isHudVisible && (
          <aside className="flight-control-panel"><h2>Simulation</h2><p>Aircraft commands are available in the live station.</p><button onClick={()=>navigate('/live')}>Open live station</button><button onClick={()=>setFcpOpen(false)}>Close</button></aside>
        )}

        {/* ── Keyboard guide (bottom-left) ── */}
        {touch ? (!isPaused && !isDestroyed && <TouchFlight onAxes={setTouchAxes}/>) : <ControlGuide />}
        <ChallengeOverlay />
      </div>

      {/* ── Pause overlay ── */}
      {(isPaused || (touch && portrait)) && (
        <PauseMenu
          installState={installState} touch={touch} firstTouch={touch && needsGuide}
          starting={touch && starting} rotate={touch && portrait}
          onResume={() => {
            const upright = touch && portraitViewport();
            if (touch) void landscapeSession.current?.request();
            setStarting(false);
            if (touch && needsGuide && !upright) {
              writePreference('nexus-touch-guide-v1', '1');
              setNeedsGuide(false);
            }
            void enableFlightAudio();
            setPaused(Boolean(upright));
          }}
          onExit={handleExit}
        />
      )}
    </div>
  );
}
