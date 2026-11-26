export function bindControls(pad,action,onPause,isFlying) {
  const keys=new Set();
  let stick=null, scanner=null, x=0, y=0;
  function centre(){
    x=y=0;
    pad.style.setProperty('--dx','0px'); pad.style.setProperty('--dy','0px');
  }
  function steer(event){
    if(event.pointerId!==stick) return;
    const rect=pad.getBoundingClientRect(), radius=rect.width*0.32;
    const dx=(event.clientX-rect.left-rect.width/2)/radius, dy=(event.clientY-rect.top-rect.height/2)/radius;
    const scale=Math.max(1,Math.hypot(dx,dy));x=dx/scale; y=dy/scale;
    pad.style.setProperty('--dx',x*radius+'px'); pad.style.setProperty('--dy',y*radius+'px');
  }
  function capture(el,event){
    event.preventDefault();el.setPointerCapture(event.pointerId);
  }
  pad.addEventListener('pointerdown',e=>{
    if(stick!==null || !isFlying() || e.button!==0) return;
    stick=e.pointerId;capture(pad,e);steer(e);
  });
  pad.addEventListener('pointermove',steer);
  action.addEventListener('pointerdown',e=>{
    if(scanner!==null || !isFlying() || e.button!==0) return;
    scanner=e.pointerId;capture(action,e);action.classList.add('pressed');
  });
  for(const event of ['pointerup','pointercancel','lostpointercapture']){
    pad.addEventListener(event,e=>{if(e.pointerId===stick){stick=null;centre();}});
    action.addEventListener(event,e=>{if(e.pointerId===scanner){scanner=null;action.classList.remove('pressed');}});
  }
  const bindings=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','Space'];
  window.addEventListener('keydown',e=>{
    if((e.code==='Escape' || e.code==='KeyP') && !e.repeat) {onPause();return;}
    if(!isFlying() || !bindings.includes(e.code) || (e.code==='Space' && e.target.closest?.('button') && e.target!==action)) return;
    e.preventDefault();keys.add(e.code);
  });
  window.addEventListener('keyup',e=>keys.delete(e.code));
  const axis=(a,b)=>Number(keys.has(a)||keys.has(b));
  return {
    read:()=>({x:stick!==null?x:axis('KeyD','ArrowRight')-axis('KeyA','ArrowLeft'),
      y:stick!==null?y:axis('KeyS','ArrowDown')-axis('KeyW','ArrowUp'),scan:scanner!==null||keys.has('Space')}),
    clear(){keys.clear();stick=scanner=null;centre();action.classList.remove('pressed');},
  };
}
