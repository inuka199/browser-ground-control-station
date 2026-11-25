import { seededRandom } from './sceneUtils.js';

const size = 40;
const clamp01 = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = x => x * x * (3 - 2 * x);

// Bake liquid water and overhead light transmission once. All quality levels
// and the camera visibility calculation sample this same three-dimensional field.
export function createCloudVolume() {
  const random = seededRandom(4093);
  const noise = Float32Array.from({length: 16 ** 3}, () => random());
  function noiseAt(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const tx = smooth(x - ix), ty = smooth(y - iy), tz = smooth(z - iz);
    function slice(k) {
      const read = (i, j) => noise[(i & 15) + 16 * ((j & 15) + 16 * (k & 15))];
      return mix(mix(read(ix, iy), read(ix + 1, iy), tx),
        mix(read(ix, iy + 1), read(ix + 1, iy + 1), tx), ty);
    }
    return mix(slice(iz), slice(iz + 1), tz);
  }
  // Overlapping domes above a broad, nearly level condensation base.
  const domes = [
    [0,-0.26,0, 0.88,0.50,0.83], [-0.43,0.03,0.06, 0.48,0.59,0.52],
    [0.07,0.17,-0.12, 0.48,0.68,0.58], [0.48,0.03,0.11, 0.43,0.54,0.55],
    [-0.17,0.04,0.40, 0.43,0.42,0.44], [0.32,-0.06,-0.45, 0.40,0.43,0.39],
  ];
  const data = new Uint8Array(size ** 3 * 2);
  const index = (i, j, k) => 2 * (i + size * (j + size * k));
  const coord = i => 2 * (i + 0.5) / size - 1;
  for (let k = 0; k < size; k++) {
    for (let i = 0; i < size; i++) {
      let light = 1;
      for (let j = size - 1; j >= 0; j--) {
        const x = coord(i), y = coord(j), z = coord(k);
        let shape = -1;
        for (const [cx,cy,cz,rx,ry,rz] of domes) {
          const r2 = ((x-cx)/rx)**2 + ((y-cy)/ry)**2 + ((z-cz)/rz)**2;
          shape = Math.max(shape, 1 - r2);
        }
        const billow = (noiseAt(x*4, y*4, z*4)-0.5)*0.90 + (noiseAt(x*11, y*11, z*11)-0.5)*0.34;
        const edge = clamp01((0.98 - Math.max(Math.abs(x),Math.abs(y),Math.abs(z))) * 15);
        const density = smooth(clamp01((shape + billow) * 1.6)) * edge;
        const at = index(i,j,k);
        data[at] = Math.round(255 * density);
        data[at + 1] = Math.round(255 * light);
        light *= Math.exp(-density * 0.12);
      }
    }
  }
  // Texel-centre coordinates and linear interpolation match the GPU sampler.
  function densityAt(x, y, z) {
    const texel = v => Math.max(0, Math.min(size-1, (v+1)*size/2 - 0.5));
    const u = texel(x), v = texel(y), w = texel(z);
    const i = Math.floor(u), j = Math.floor(v), k = Math.floor(w);
    const i1 = Math.min(i+1,size-1), j1 = Math.min(j+1,size-1), k1 = Math.min(k+1,size-1);
    const slice = n => mix(
      mix(data[index(i,j,n)], data[index(i1,j,n)], u-i),
      mix(data[index(i,j1,n)], data[index(i1,j1,n)], u-i), v-j);
    return mix(slice(k), slice(k1), w-k) / 255;
  }
  return { size, data, densityAt };
}
