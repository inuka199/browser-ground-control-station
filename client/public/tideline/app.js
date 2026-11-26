import {launch,advance,distance,score,readPilot,savePilot,STOPS,RADIUS,HOLD} from './game.js';
import {bindControls} from './controls.js';
import {createChart} from './chart.js';
import {setupInstallation} from './install.js';

const el=id=>document.getElementById(id);
let storage;try{storage=window.localStorage;}catch{/* Private storage. */}
const pilot=readPilot(storage);
let flight=pilot.flight||launch(), mode='brief', context, lastTime=null, savedAt=0, frame=0, lastHud=0, lastDraw=0;
const chart=createChart(el('chart'));
const controls=bindControls(el('stick'),el('scan'),()=>{
  if(el('help').open)return;
  if(mode==='flight')pause(); else if(mode==='paused')fly();
},()=>mode==='flight');
const points=n=>n.toLocaleString()+' pts';
function save() {
  pilot.flight=flight.status==='flying' && (mode!=='brief'||pilot.flight) ? flight:null;
  el('storage').hidden=savePilot(storage,pilot);
}
function tone(hz,seconds=.1) {
  if(pilot.muted || !context || context.state!=='running')return;
  const o=context.createOscillator(),g=context.createGain(),t=context.currentTime;
  o.type='sine';o.frequency.setValueAtTime(hz,t);o.frequency.exponentialRampToValueAtTime(hz*1.3,t+seconds);
  g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.09,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+seconds);
  o.connect(g);g.connect(context.destination);o.start();o.stop(t+seconds);
  o.onended=()=>{o.disconnect();g.disconnect();};
}
function unlock(){
  if(pilot.muted)return;
  try {const Audio=window.AudioContext||window.webkitAudioContext;context??=new Audio();context.resume().catch(()=>{});}
  catch {/* The game also runs without an audio device. */}
}
function soundLabel(){
  el('sound').textContent=pilot.muted?'Sound off':'Sound on';el('sound').setAttribute('aria-pressed',String(!pilot.muted));
}
function hud(){
  const target=STOPS[Math.min(flight.leg,3)], dock=flight.leg===3, gap=distance(flight);
  el('leg').textContent=dock?'Return to base':'Beacon '+(flight.leg+1)+' of 3';
  el('target').textContent=target.name;
  el('battery').textContent=Math.ceil(flight.charge)+'%';el('meter').value=flight.charge;
  el('distance').textContent=flight.scan>0?Math.floor(flight.scan/HOLD*100)+'%':Math.round(gap)+' m';
  el('cue').textContent=gap<=RADIUS?(dock?'Hold to dock':'Hold to scan'):'Fly to the amber ring';
  el('scan').lastElementChild.textContent=dock?'Dock':'Scan';el('scan').setAttribute('aria-label',dock?'Hold to dock':'Hold to scan');
  el('score').textContent=points(score(flight));
}
function layout(){
  const active=mode==='flight', paused=mode==='paused', ended=mode==='empty'||mode==='complete';
  el('deck').dataset.mode=active?'flight':'brief';
  el('flight').hidden=el('controls').hidden=el('pause').hidden=!active;
  el('brief').hidden=active;
  installation.showInstall(!active);
  el('restart').hidden=!(paused || (mode==='brief' && pilot.flight)); el('how').hidden=paused || ended;
  el('title').textContent=paused?'Flight paused':mode==='complete'?'Patrol complete':mode==='empty'?'Battery empty':'Beacon patrol';
  el('description').textContent=paused?'Your drone is holding position. Resume when you’re ready.':
    mode==='complete'?'All three signals surveyed. Your drone is back at Jetty Base.':
    mode==='empty'?'The battery ran out before docking. Fly directly between beacons to leave time for the return.':
    pilot.flight?'Your flight is saved. Continue the survey from your last position.':
    'Three beacons. One battery. Fly the bay, scan each signal and bring your drone back to the jetty.';
  const hasRun=paused||ended||pilot.flight;
  el('factLabel').textContent=ended?'Flight score':hasRun?'Surveyed':'Flight time';
  el('factValue').textContent=ended?points(score(flight)):hasRun?Math.min(flight.leg,3)+' of 3':'100 seconds';
  el('best').textContent=pilot.best?points(pilot.best):'—';
  el('start').firstChild.textContent=ended?'Fly again ':paused||pilot.flight?'Resume flight ':'Start flight ';
  el('score').textContent=active?points(score(flight)):'';
  chart.resize();chart.render(flight,!active);if(active)hud();
}
function fly(fresh=false){
  if(fresh||mode==='complete'||mode==='empty')flight=launch();
  unlock();controls.clear();mode='flight';lastTime=null;savedAt=0;lastHud=0;
  layout();save();el('start').blur();requestFrame();
}
function pause(){
  if(mode!=='flight')return;
  mode='paused';controls.clear();lastTime=null;
  cancelAnimationFrame(frame);frame=0;save();layout();
}
function tick(now){
  frame=0;if(mode!=='flight')return;
  const dt=lastTime===null?0:(now-lastTime)/1000;lastTime=now;
  const old=flight.leg;advance(flight,controls.read(),dt);
  if(flight.status!=='flying'){
    mode=flight.status;controls.clear();pilot.best=Math.max(pilot.best,score(flight));save();
    tone(mode==='complete'?720:150,.3);layout();return;
  }
  if(flight.leg!==old){tone(580,.2);save();}
  if(now-savedAt>=1000){save();savedAt=now;}
  if(now-lastHud>=90 || flight.leg!==old){hud();lastHud=now;}
  // The chart is already rasterized. Limit redraws on high refresh displays
  // while keeping controls and flight integration on the animation clock.
  if(now-lastDraw>=1000/60-1){chart.render(flight,false);lastDraw=now;}
  requestFrame();
}
function requestFrame(){if(!frame)frame=requestAnimationFrame(tick);}
function dialog(title,lines){
  el('helpTitle').textContent=title;
  el('helpBody').replaceChildren(...lines.map(text=>{const p=document.createElement('p');p.textContent=text;return p;}));
  el('help').showModal();
}
const installation=setupInstallation({button:el('install'),update:el('update'),status:el('availability'),dialog,
  checkpoint:()=>{if(mode==='flight')pause();}});
el('start').addEventListener('click',()=>fly());
el('restart').addEventListener('click',()=>fly(true));
el('pause').addEventListener('click',pause);
el('sound').addEventListener('click',()=>{
  pilot.muted=!pilot.muted;soundLabel();save();
  if(pilot.muted)context?.suspend().catch(()=>{});else {unlock();tone(400);}
  el('sound').blur();
});
el('how').addEventListener('click',()=>dialog('How to fly',[
  'Drag the left stick to steer. Follow the amber marker to the current beacon. The arrow points toward it when it is outside the chart.',
  'Inside the ring, hold Scan until it fills. Survey all three in order, then hold Dock at Jetty Base. The battery lasts 100 seconds.',
  'Each survey earns 250 points. Docking earns 500 plus a bonus for remaining charge. On a keyboard, use WASD or arrows, hold Space to scan, and press P to pause.'
]));
el('close').addEventListener('click',()=>el('help').close());
document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
window.addEventListener('blur',pause);window.addEventListener('pagehide',pause);
new ResizeObserver(()=>{chart.resize();chart.render(flight,mode!=='flight');}).observe(el('chart'));
soundLabel();layout();
