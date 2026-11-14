/**
 * store/slices/training.js
 * Training and tutorial progress state.
 * Phase 1: stub. Phase 5 will add full tutorial engine.
 */
import { create } from 'zustand';

export const useTrainingStore = create((set) => ({
  /** Map of tutorial/lesson ID → completion state */
  completed: {},
  /** Currently active tutorial step index */
  activeTutorialId: null,
  activeStepIndex: 0,

  markComplete: (id) => set((s) => ({ completed: { ...s.completed, [id]: true } })),
  startTutorial: (id) => set({ activeTutorialId: id, activeStepIndex: 0 }),
  nextStep: () => set((s) => ({ activeStepIndex: s.activeStepIndex + 1 })),
  prevStep: () => set((s) => ({ activeStepIndex: Math.max(0, s.activeStepIndex - 1) })),
  endTutorial: () => set({ activeTutorialId: null, activeStepIndex: 0 }),
}));
