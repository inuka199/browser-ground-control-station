import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { buildStreamingCoast } from '../src/components/simulator/world/StreamingCoast.js';
import { buildOpenOcean } from '../src/components/simulator/world/OceanSurface.js';
import { viewRange } from '../src/components/simulator/world/coastalTerrain.js';

// CPU cost of building scene geometry on a repeatable 6.4 km inland route.
// Sample each 64 m streaming decision. Idle frames would hide the cost of a tile change.
const results=[];
for (const quality of ['low','balanced','high']) {
  const coast=buildStreamingCoast();
  const original=new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial());
  const ocean=buildOpenOcean(original);
  const times=[];
  let cold=0, peak=0;
  for (let n=0; n<=100; n++) {
    const eye={x:n*64, y:500, z:4000};
    const start=performance.now();
    coast.update(eye, quality);
    coast.updateLandmarks(eye);
    ocean.update(eye, quality, 3 * 2**Math.ceil(Math.log2(viewRange(eye.y))));
    const ms=performance.now()-start;
    if (n===0) cold=ms;
    else times.push(ms);
    peak=Math.max(peak,coast.tiles.size);
  }
  times.sort((a,b)=>a-b);
  results.push({quality,coldMs:+cold.toFixed(1),medianMs:+times[49].toFixed(2),
    p95Ms:+times[94].toFixed(2),maxMs:+times[99].toFixed(2),peakLandTiles:peak});
  coast.dispose(); ocean.dispose(); original.geometry.dispose(); original.material.dispose();
}
console.table(results);

