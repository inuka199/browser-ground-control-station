import { useSimulatorStore } from '../../store/slices/simulator.js';
import { useChallengeStore } from '../../store/slices/challenges.js';

// Explicit launch links also work after a reload or when opened in a new tab.
export function prepareFlightLaunch(destination) {
  if (!['galle-face', 'port-city', 'live'].includes(destination)) return false;
  const sim = useSimulatorStore.getState();
  if (sim.isRecording) sim.stopRecording();
  useChallengeStore.getState().abortChallenge();
  useChallengeStore.getState().dismissOutcome();
  if (destination !== 'live') {
    sim.setLaunchPoint(destination);
    sim.setTilesEnabled(false);
  }
  sim.setFlightSource(destination === 'live' ? 'auto' : 'demo');
  sim.setCameraMode('chase');
  sim.restartDemo();
  return true;
}
