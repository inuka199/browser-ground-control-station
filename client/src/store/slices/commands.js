/**
 * store/slices/commands.js
 * Command pipeline state — Stage 4 extended.
 *
 * Tracks the most recent command for UI display.
 * Fields:
 *   state       — 'idle' | 'pending' | 'success' | 'error'
 *   message     — human-readable status string
 *   targetMode  — for SET_MODE commands
 *   label       — for COMMAND_LONG commands (e.g. 'ARM', 'TAKEOFF')
 *   history     — last 20 commands [{time, type, label, status}]
 */
import { create } from 'zustand';

export const useCommandStore = create((set) => ({
  // ── Current command state ──────────────────────────────────────────────────
  state:      'idle',   // 'idle' | 'pending' | 'success' | 'error'
  message:    '',
  targetMode: null,     // set for SET_MODE commands
  label:      null,     // set for COMMAND_LONG commands

  // ── Command history (newest first) ────────────────────────────────────────
  history: [],

  // ── Actions ───────────────────────────────────────────────────────────────

  setPending: (modeOrLabel, msg) =>
    set((s) => s.state === 'pending' && s.label === modeOrLabel ? { message: msg } : ({
      state:      'pending',
      message:    msg,
      targetMode: modeOrLabel,
      label:      modeOrLabel,
      history:    [
        { time: new Date().toLocaleTimeString(), type: 'SENT', label: modeOrLabel, status: 'SUBMITTED' },
        ...s.history.slice(0, 19),
      ],
    })),

  setSuccess: (msg) =>
    set((s) => ({
      state:      'success',
      message:    msg,
      targetMode: null,
      label:      null,
      history: s.history[0]?.status === 'SUBMITTED'
        ? [{ ...s.history[0], status: 'CONFIRMED' }, ...s.history.slice(1)]
        : s.history,
    })),

  setError: (msg) =>
    set((s) => ({
      state:      'error',
      message:    msg,
      targetMode: null,
      label:      null,
      history: s.history[0]?.status === 'SUBMITTED'
        ? [{ ...s.history[0], status: 'FAILED' }, ...s.history.slice(1)]
        : s.history,
    })),

  clearHistory: () => set({ history: [] }),

  reset: () => set({ state: 'idle', message: '', targetMode: null, label: null }),
}));
