import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const useAudioStore = create(persist((set) => ({
  muted: false,
  volume: 0.45,
  status: 'idle',
  toggleMuted: () => set(state => ({ muted: !state.muted })),
  setVolume: volume => {
    if (Number.isFinite(volume)) set({ volume: Math.min(1, Math.max(0, volume)) });
  },
  setStatus: status => set({ status }),
}), {
  name: 'nexus-flight-audio',
  partialize: ({ muted, volume }) => ({ muted, volume }),
}));
