export const HOME = { x: 245, y: 790, name: 'Jetty Base' };
export const STOPS = [
  { x: 465, y: 610, name: 'Bell Buoy' },
  { x: 740, y: 315, name: 'North Light' },
  { x: 1030, y: 555, name: 'East Shoal' },
  HOME,
];
export const CAPACITY = 100;
export const RADIUS = 40;
export const HOLD = 1.35;
const KEY = 'tideline.pilot.v1';
const clamp = (n,min,max) => Math.min(max,Math.max(min,n));

export function launch() {
  return {x:HOME.x,y:HOME.y,vx:0,vy:0,angle:0,leg:0,charge:CAPACITY,scan:0,status:'flying'};
}
export function distance(f) {
  const stop=STOPS[Math.min(f.leg,3)];
  return Math.hypot(stop.x-f.x,stop.y-f.y);
}
export function score(f) {
  return Math.min(f.leg,3)*250+(f.status==='complete'?500+Math.ceil(f.charge)*10:0);
}

// Integrate in short steps so a slow frame cannot skip a beacon or a landing.
export function advance(f, input, seconds) {
  if(f.status!=='flying') return;
  const duration=clamp(seconds,0,0.25);
  for(let left=duration;left>1e-8 && f.status==='flying';left-=1/60) {
    const dt=Math.min(left,1/60);
    const lock=input.scan && distance(f)<=RADIUS;
    const magnitude=Math.hypot(input.x,input.y);
    const speed=lock?18:68;
    const factor=speed/Math.max(1,magnitude);
    const breeze=lock?0:2.5;
    const desiredX=input.x*factor+breeze*Math.sin((100-f.charge)/9);
    const desiredY=input.y*factor-breeze*0.55;
    const smooth=-Math.expm1(-dt*(lock?10:5));
    f.vx+=(desiredX-f.vx)*smooth; f.vy+=(desiredY-f.vy)*smooth;
    f.x=clamp(f.x+f.vx*dt,45,1235); f.y=clamp(f.y+f.vy*dt,55,950);
    if(Math.hypot(f.vx,f.vy)>5) f.angle=Math.atan2(f.vy,f.vx)+Math.PI/2;
    f.charge=Math.max(0,f.charge-dt);
    if(f.charge===0) { f.status='empty'; f.scan=0; break; }
    f.scan=lock && distance(f)<=RADIUS ? f.scan+dt : 0;
    if(f.scan>=HOLD) {
      f.scan=0; f.leg++;
      if(f.leg===STOPS.length) f.status='complete';
    }
  }
}
export function readPilot(storage) {
  const pilot={muted:false,best:0,flight:null};
  try {
    const data=JSON.parse(storage.getItem(KEY));
    if(!data || data.version!==1) return pilot;
    pilot.muted=data.muted===true;
    if(Number.isSafeInteger(data.best) && data.best>=0) pilot.best=data.best;
    const f=data.flight;
    if(f && f.status==='flying' && Number.isInteger(f.leg) && f.leg>=0 && f.leg<STOPS.length
      && Number.isFinite(f.charge) && f.charge>0 && f.charge<=CAPACITY
      && Number.isFinite(f.x) && f.x>=45 && f.x<=1235 && Number.isFinite(f.y) && f.y>=55 && f.y<=950) {
      pilot.flight={...launch(),x:f.x,y:f.y,angle:Number.isFinite(f.angle)?f.angle:0,leg:f.leg,charge:f.charge};
    }
  } catch { /* Storage can be unavailable or contain an older save. */ }
  return pilot;
}
export function savePilot(storage,pilot) {
  try { storage.setItem(KEY,JSON.stringify({...pilot,version:1})); return true; }
  catch { return false; }
}
