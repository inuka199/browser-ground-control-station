import { localId } from '../../services/localId.js';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export const CHALLENGES = [
  { id: 'first-flight', title: 'First flight', description: 'Climb to 10 m, hover for 3 seconds, then land near home.', objectives: ['Climb to 10 metres', 'Hover at 8–12 m for 3 seconds', 'Land within 8 m of home'] },
  { id: 'coastal-circuit', title: 'Coastal circuit', description: 'Climb to 25 m, fly 60 m from home, then return and land.', objectives: ['Climb to 25 metres', 'Travel 60 metres from home', 'Return and land within 8 m of home'] },
  { id: 'pursuit', title: 'City pursuit', description: 'Chase a fleeing car through the city. Fly within 35 m at 3–40 m altitude, then press T to trigger an arcade explosion. Nearby cars are affected too. Avoid traffic: a collision destroys your drone.', objectives: ['Take off above 3 metres', 'Catch the orange target car', 'Press T while the target is locked'], arcade:true },
  { id: 'parcel-delivery', title: 'Special delivery', description: 'Collect a parcel at A, carry it to the marked B pad, and land. A recipient walks over, collects the parcel and carries it away.', objectives: ['Wait on pad A to load the parcel', 'Fly to B and land inside the ring', 'Stay landed while the recipient collects it'], arcade:true },
];
export function advanceChallenge(active, sample, delta) {
  if (!active || ![sample.x, sample.y, sample.z, sample.speed].every(Number.isFinite)) return active;
  if (CHALLENGES.find(item=>item.id===active.id)?.arcade) return active;
  const dt = Number.isFinite(delta) ? Math.max(0, Math.min(0.5, delta)) : 0;
  const next = { ...active, elapsed: active.elapsed + dt };
  const distance = Math.hypot(sample.x, sample.z);
  const hazard = sample.clearance < 3 && sample.y > 0.1;
  if (hazard && !active.inHazard) next.warnings++;
  next.inHazard = hazard;
  if (next.stage === 0 && sample.y >= (active.id === 'first-flight' ? 10 : 25)) next.stage = 1;
  else if (next.stage === 1) {
    if (active.id === 'first-flight') {
      next.hover = sample.y >= 8 && sample.y <= 12 && sample.speed < 1 && Math.abs(sample.climb || 0) < 0.5 ? next.hover + dt : 0;
      if (next.hover >= 3) next.stage = 2;
    } else if (distance >= 60) next.stage = 2;
  } else if (next.stage === 2 && sample.y <= 0.1 && distance <= 8) next.stage = 3;
  return next;
}
export const useChallengeStore = create(persist((set, get) => ({
  active: null, results: {}, lastOutcome:null, actionSerial:0,
  startChallenge: id => {
    if (!CHALLENGES.some(challenge => challenge.id === id)) return;
    set({ active: { id, runId:localId(), stage: 0, hover: 0, elapsed: 0, warnings: 0, inHazard: false },lastOutcome:null,actionSerial:0 });
  },
  observe: (sample, delta) => {
    const active = advanceChallenge(get().active, sample, delta);
    if (!active) return;
    if (active.stage === 3) {
      const result={ elapsed: active.elapsed, warnings: active.warnings, score: Math.max(0, 100 - active.warnings * 10), completedAt: new Date().toISOString() };
      set({ active: null,lastOutcome:{...result,id:active.id,status:'complete'}, results: { ...get().results, [active.id]:result } });
    } else set({ active });
  },
  abortChallenge: () => set({ active: null }),
  triggerAction: () => { if(get().active?.id==='pursuit') set(s=>({actionSerial:s.actionSerial+1})); },
  updateGame: (game,runId) => {
    if(get().active?.runId!==runId) return;
    if(game.status!=='running') {get().finishGame(game.status,game.message,game.elapsed);return;}
    set(s=>({active:{...s.active,stage:game.stage,elapsed:game.elapsed,message:game.message,distance:game.distance,bearing:game.bearing,carrying:game.carrying}}));
  },
  finishGame: (status,message,elapsed) => {
    const active=get().active;if(!active) return;
    const result={id:active.id,status,message,elapsed:elapsed??active.elapsed,score:status==='complete' ? 100 : 0,warnings:active.warnings,completedAt:new Date().toISOString()};
    set({active:null,lastOutcome:result,...(status==='complete' ? {results:{...get().results,[active.id]:result}} : {})});
  },
  dismissOutcome: () => set({lastOutcome:null}),
}), { name: 'nexus-challenges', partialize: ({ results }) => ({ results }) }));
