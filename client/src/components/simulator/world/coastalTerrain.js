const clamp = t => Math.max(0, Math.min(1, t));
export function blend(a, b, x) {
  const t = clamp((x - a) / (b - a));
  return t*t*(3 - 2*t);
}

export const COAST_X = -140;
export const GRID = 16;
export const LANDMARK_SPACING = 3072;
export function coastX(z) {
  const bays = 440*Math.sin(z/1700) + 690*Math.sin(z/4800) + 95*Math.sin(z/610);
  return COAST_X + blend(1300, 2700, Math.abs(z))*bays;
}

// Integer lattice noise gives each district a stable identity on return.
function hash(i,j) {
  let bits = Math.imul(i, 374761393) + Math.imul(j, 668265263);
  bits = Math.imul(bits ^ (bits >>> 13), 1274126177);
  return ((bits ^ (bits >>> 16)) >>> 0) / 4294967296;
}
function noise(x,z,scale) {
  const i = Math.floor(x/scale), j = Math.floor(z/scale);
  const u = blend(0,1,x/scale-i), v = blend(0,1,z/scale-j);
  const a = hash(i,j)*(1-u) + hash(i+1,j)*u;
  const b = hash(i,j+1)*(1-u) + hash(i+1,j+1)*u;
  return a*(1-v) + b*v;
}
const islandSpacing=2*LANDMARK_SPACING;
function islandAt(i,j) {
  if(i>=0 || (hash(i+17,j-4)<0.38 && !(i===-1 && j===0))) return null;
  const x=(i+0.38+hash(i+1,j)*0.22)*islandSpacing;
  const z=(j+0.34+hash(i,j-2)*0.28)*islandSpacing;
  if(x>coastX(z)-1750) return null;
  return {x,z,rx:420+410*hash(i,j+3),rz:315+580*hash(i-8,j),height:75+160*hash(i,j+5)};
}
export function hasLand(x,z,size) {
  if(x+size>=-1450 || size>islandSpacing) return true;
  for(let j=Math.floor(z/islandSpacing);j<=Math.floor((z+size)/islandSpacing);j++) {
    for(let i=Math.floor(x/islandSpacing);i<=Math.floor((x+size)/islandSpacing);i++) {
      const isle=islandAt(i,j);
      if(isle && x<=isle.x+isle.rx && x+size>=isle.x-isle.rx && z<=isle.z+isle.rz && z+size>=isle.z-isle.rz) return true;
    }
  }
  return false;
}
export function terrainHeight(x,z) {
  const inland = x-coastX(z);
  if (inland < 0) {
    const bed=Math.max(-38,-0.38 + inland*0.15);
    if(inland>-600) return bed;
    const isle=islandAt(Math.floor(x/islandSpacing),Math.floor(z/islandSpacing));
    if(!isle) return bed;
    const radius=((x-isle.x)/isle.rx)**2+((z-isle.z)/isle.rz)**2;
    return radius>=1 ? bed : bed + (1-radius)**1.5*(isle.height+38)*(0.8+0.4*noise(x,z,220));
  }
  const outsideCity = Math.max(Math.abs(z)-1250, x-1900, 0);
  if(outsideCity===0) return -0.38;
  const slope = blend(0,850,outsideCity);
  const hills = 3 + 85*noise(x,z,540) + 670*noise(x,z,2100)**2 + 18*noise(x,z,170);
  return -0.38 + slope*(3*blend(0,55,inland) + hills*blend(95,2200,inland));
}

// Match the two triangles of the most detailed visible tile, including its diagonal.
export function groundAt(x,z) {
  const x0 = COAST_X + GRID*Math.floor((x-COAST_X)/GRID), z0 = GRID*Math.floor(z/GRID);
  const u = (x-x0)/GRID, v = (z-z0)/GRID;
  const b = terrainHeight(x0+GRID,z0), c = terrainHeight(x0,z0+GRID);
  const y = u+v<=1 ? terrainHeight(x0,z0)*(1-u-v)+b*u+c*v :
    terrainHeight(x0+GRID,z0+GRID)*(u+v-1)+b*(1-v)+c*(1-u);
  return Math.max(0,y);
}

export function roadsAt(x,z) {
  const bend = blend(900,2400,Math.abs(z));
  const trunk = coastX(z)+205 + bend*75*Math.sin(z/370);
  return [x-trunk, z + 120 + blend(810,2100,x)*155*Math.sin(x/770)];
}

export function landmarkAt(i,j) {
  if(i<0 && i%2===0 && j%2===0) {
    const isle=islandAt(i/2,j/2);
    if(isle) return {x:isle.x,z:isle.z,y:groundAt(isle.x,isle.z),coastal:true,name:'Island beacon '+i+'/'+j};
  }
  const z = (j + 0.32 + hash(i+7,j)*0.36)*LANDMARK_SPACING;
  const x = i===0 ? coastX(z)+42 : (i+0.25+0.5*hash(j,i+4))*LANDMARK_SPACING;
  if (x<coastX(z) || (x<2000 && Math.abs(z)<1400)) return null;
  return {x,z,y:groundAt(x,z), coastal:i===0, name:(i===0?'Cape light':'Ridge observatory')+' '+i+'/'+j};
}

export function launchGuide(point, launch) {
  const dx=launch.x-point.x, dz=launch.z-point.z;
  const distance=Math.hypot(dx,dz);
  const bearing=(Math.atan2(dx,-dz)*180/Math.PI+360)%360;
  return {distance, bearing, turn:((bearing+point.yaw*180/Math.PI+180)%360+360)%360-180};
}

export function settleOnTerrain(state) {
  const ground=groundAt(state.x,state.z);
  return {...state,y:Math.max(state.y,ground),grounded:state.y<=ground};
}

export function viewRange(altitude, quality) {
  return (8192 + Math.max(0,altitude)*9) * (quality === 'low' ? 0.75 : 1);
}

