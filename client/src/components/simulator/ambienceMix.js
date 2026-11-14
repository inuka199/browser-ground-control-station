const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
/** Listener-centred blend; coast and harbour have distinct acoustic regions. */
export function ambienceMix(frame) {
  const x=finite(frame.x),z=finite(frame.z),altitude=Math.max(0,finite(frame.altitude));
  const ground=Math.exp(-altitude/150),day=Math.max(0,Math.min(1,finite(frame.daylight,1)));
  const coast=Math.exp(-Math.max(0,finite(frame.coastDistance,Math.abs(x+145)))/260);
  const harbour=Math.exp(-Math.hypot(x+400,z+800)/280)*ground;
  const city=Math.exp(-Math.max(0,65-x)/240)*ground*(frame.cityLife?1:0);
  return {ground,day,coast:coast*ground,harbour:frame.cityLife?harbour:0,traffic:city*(0.28+day*0.72),birds:ground*day,night:ground*(1-day)};
}
