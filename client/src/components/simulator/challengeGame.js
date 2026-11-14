// Arcade rules are local to the demo, in metres and seconds. No vehicle commands.
export const DELIVERY_A = { x: 0, y: 0, z: 0 };
export const DELIVERY_B = { x: -45, y: 0, z: -170 };
export const RECIPIENT_HOME = { x: -33, y: 0, z: -170 };
export const isArcadeChallenge = id => ['pursuit', 'parcel-delivery'].includes(id);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function pursuitPosition(time) {
  // Follows the avenue road centre and rounded corner approaches.
  const points = [{x:62,z:-55},{x:62,z:-594},{x:71,z:-603},{x:419,z:-603},{x:428,z:-594},{x:428,z:354},{x:419,z:363},{x:71,z:363},{x:62,z:354},{x:62,z:-55}];
  const lengths = points.slice(1).map((point,i) => distance(point,points[i]));
  let travel = (time * 11) % lengths.reduce((a,b) => a+b,0);
  for (let i=0;i<lengths.length;i++) {
    if (travel <= lengths[i]) {
      const a=points[i], b=points[i+1], f=travel/lengths[i];
      return {x:a.x+(b.x-a.x)*f,y:0,z:a.z+(b.z-a.z)*f,yaw:Math.atan2(b.x-a.x,b.z-a.z),halfWidth:1,halfLength:2.2,height:1.7};
    }
    travel -= lengths[i];
  }
  return { ...points[0], y:0, yaw:Math.PI, halfWidth:1, halfLength:2.2, height:1.7 };
}

/** Swept relative segment against an oriented car box; avoids tunnelling. */
export function hitsCar(previous, current, car, clearance = 0.5) {
  if (car.destroyed || !car.active) return false;
  const convert = (point, origin) => {
    const x=point.x-origin.x,z=point.z-origin.z,c=Math.cos(car.yaw),s=Math.sin(car.yaw);
    return [x*c-z*s,point.y+clearance,x*s+z*c];
  };
  const a=convert(previous,car.previous || car), b=convert(current,car);
  const minimum=[-car.halfWidth-0.6,-0.4,-car.halfLength-0.6];
  const maximum=[car.halfWidth+0.6,car.height+0.4,car.halfLength+0.6];
  let enter=0,exit=1;
  for(let i=0;i<3;i++) {
    const direction=b[i]-a[i];
    if(Math.abs(direction)<1e-9) { if(a[i]<minimum[i] || a[i]>maximum[i]) return false; continue; }
    const t1=(minimum[i]-a[i])/direction,t2=(maximum[i]-a[i])/direction;
    enter=Math.max(enter,Math.min(t1,t2)); exit=Math.min(exit,Math.max(t1,t2));
    if(enter>exit) return false;
  }
  return true;
}

export function createChallengeGame(id) {
  return { id, stage:0, elapsed:0, hold:0, collection:0, phase:'approach', status:'running', target:pursuitPosition(0), recipient:{...RECIPIENT_HOME}, carrying:false, detonated:false, message:'', events:[] };
}
export function stepChallengeGame(state, drone, delta, detonate = false) {
  if(state.status !== 'running') return {...state,events:[]};
  const dt=Number.isFinite(delta) ? Math.max(0,Math.min(delta,0.2)) : 0;
  if(!dt || ![drone.x,drone.y,drone.z,drone.speed].every(Number.isFinite)) return {...state,events:[]};
  const next={...state,elapsed:state.elapsed+dt,events:[],recipient:{...state.recipient}};
  if(next.id==='pursuit') {
    next.target=pursuitPosition(next.elapsed);
    next.distance=distance(drone,next.target);
    next.bearing=(Math.atan2(next.target.x-drone.x,drone.z-next.target.z)*180/Math.PI+360)%360;
    if(next.stage===0 && drone.y>=3) next.stage=1;
    const ready=next.stage>=1 && next.distance<=35 && drone.y>=2.5 && drone.y<=40;
    next.stage=ready ? 2 : Math.min(next.stage,1);
    next.message=ready ? 'Target locked · Press T to detonate' : 'Chase the marked car · Get within 35 m at 3–40 m altitude';
    if(detonate) {
      if(ready) {
        next.detonated=true; next.status='complete'; next.stage=3;
        next.message='Target stopped. Nearby cars caught in the blast are disabled.';
        next.events.push({type:'explosion',position:{...next.target,y:1},scale:1.3});
      } else next.message='Out of range · Chase closer before pressing T';
    }
    if(next.elapsed>=180 && next.status==='running') { next.status='failed'; next.message='The target escaped. Try the pursuit again.'; }
    return next;
  }
  const landed=drone.y<=0.15 && drone.speed<0.8;
  const atA=landed && distance(drone,DELIVERY_A)<=5;
  const atB=landed && distance(drone,DELIVERY_B)<=6;
  next.distance=distance(drone,next.stage===0 ? DELIVERY_A : DELIVERY_B);
  const destination=next.stage===0 ? DELIVERY_A : DELIVERY_B;
  next.bearing=(Math.atan2(destination.x-drone.x,drone.z-destination.z)*180/Math.PI+360)%360;
  if(next.stage===0) {
    next.hold=atA ? next.hold+dt : 0;
    next.message='Point A · Stay on the home pad to load the parcel';
    if(next.hold>=1) { next.stage=1;next.hold=0;next.carrying=true;next.events.push({type:'pickup'}); }
  } else if(next.stage===1) {
    next.message='Deliver to B · Land inside the green ring and hold still';
    next.hold=atB ? next.hold+dt : 0;
    if(next.hold>=1.5) { next.stage=2;next.hold=0;next.phase='approach'; }
  } else if(next.stage===2) {
    if(next.phase!=='depart' && !atB) {
      next.stage=1;next.hold=0;next.collection=0;next.recipient={...RECIPIENT_HOME};
      next.message='Keep the drone landed while the recipient approaches';
    } else {
      const destination=next.phase==='depart' ? RECIPIENT_HOME : {x:drone.x+1.5,z:drone.z};
      const length=distance(next.recipient,destination),step=Math.min(length,dt*2.2);
      if(length>0.05) {
        next.recipient.x+=(destination.x-next.recipient.x)/length*step;
        next.recipient.z+=(destination.z-next.recipient.z)/length*step;
        next.recipient.yaw=Math.atan2(destination.x-next.recipient.x,destination.z-next.recipient.z);
      }
      next.message=next.phase==='depart' ? 'Parcel collected · Recipient returning home' : 'Hold position · Recipient collecting the parcel';
      if(length<=0.2 && next.phase==='approach') {
        next.collection+=dt;
        if(next.collection>=1.2) {next.carrying=false;next.phase='depart';next.events.push({type:'delivery'});}
      } else if(length<=0.2 && next.phase==='depart') {next.stage=3;next.status='complete';next.message='Parcel delivered. The recipient has collected the delivery.';}
    }
  }
  return next;
}
