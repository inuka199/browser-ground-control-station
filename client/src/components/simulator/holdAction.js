// Wall-clock hold, independent of graphics frame rate. Releasing early cancels it.
export function createHoldAction(onHold, onTap, duration = 1000) {
  let start = null, fired = false;
  return {
    begin(now) { if (start === null) { start = now; fired = false; } },
    tick(now) {
      if (start === null) return 0;
      const progress = Math.min(1, Math.max(0, (now - start) / duration));
      if (progress === 1 && !fired) { fired = true; onHold(); }
      return progress;
    },
    release(now) { if (start === null) return; this.tick(now); if (!fired) onTap(); this.cancel(); },
    cancel() { start = null; fired = false; },
  };
}
