// One audible pedestrian and vehicle per listener keep the Web Audio graph
// bounded for every graphics quality. The camera's right axis includes yaw.
export function streetSources(camera, people, traffic) {
  const ear=camera.position, right=camera.matrixWorld.elements;
  function nearest(actors,height,range) {
    let best=null, distanceSq=range*range;
    for(const actor of actors) {
      if(!actor.active || actor.impact || actor.destroyed)continue;
      const dx=actor.x-ear.x,dy=height-ear.y,dz=actor.z-ear.z;
      const d=dx*dx+dy*dy+dz*dz;
      if(d>=distanceSq)continue;
      best=actor;distanceSq=d;
    }
    if(!best)return null;
    const distance=Math.sqrt(distanceSq), dx=best.x-ear.x,dy=height-ear.y,dz=best.z-ear.z;
    return {gain:(1-distance/range)**2,
      pan:Math.max(-1,Math.min(1,(dx*right[0]+dy*right[1]+dz*right[2])/Math.max(distance,1))),
      actor:best};
  }
  return {person:nearest(people,1.5,28),vehicle:nearest(traffic,0.8,65)};
}
