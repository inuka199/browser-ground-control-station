export const portraitQuery = '(orientation: portrait)';

export function portraitViewport() {
  return window.matchMedia?.(portraitQuery)?.matches ?? window.innerHeight >= window.innerWidth;
}

// A route owns only the lock and fullscreen element it requested. A browser
// prompt can settle after the player has left the simulator.
export function createLandscapeSession(element) {
  const orientation = window.screen?.orientation;
  let disposed = false, pending = false, requestedLock = false, requestedFullscreen = false;

  function release() {
    if (requestedLock) {
      try { orientation.unlock?.(); } catch { /* The OS may have released it already. */ }
    }
    if (requestedFullscreen && document.fullscreenElement === element) {
      void document.exitFullscreen().catch(() => {});
    }
  }
  return {
    async request() {
      if (disposed || pending || !orientation?.lock) return;
      pending = true;
      try {
        const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || navigator.standalone;
        if (!standalone && !document.fullscreenElement && element.requestFullscreen && document.fullscreenEnabled !== false) {
          requestedFullscreen = true;
          try { await element.requestFullscreen(); } catch { /* Some browsers allow a direct lock. */ }
        }
        if (!disposed && !document.hidden) {
          requestedLock = true;
          await orientation.lock('landscape');
        }
      } catch {
        // Actual viewport changes drive the rotate prompt, including denial.
      } finally {
        pending = false;
        if (disposed) release();
      }
    },
    dispose() { disposed = true; release(); }
  };
}
