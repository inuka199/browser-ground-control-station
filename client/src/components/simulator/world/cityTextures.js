import * as THREE from 'three';
import { seededRandom } from './sceneUtils.js';

function canvasTexture(size, draw, color = true) {
  const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function surfaceTexture(kind) {
  const random = seededRandom(kind === 'grass' ? 73 : 12);
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = kind === 'grass' ? '#6d8050' : kind === 'paving' ? '#ada99e' : '#53575b'; ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 16000; i++) {
      const light = random() > 0.5;
      ctx.fillStyle = light ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.10)';
      ctx.fillRect(random() * size, random() * size, kind === 'grass' ? 1 : 2, kind === 'grass' ? 4 : 1);
    }
    if (kind === 'paving') {
      ctx.strokeStyle = '#77786f'; ctx.lineWidth = 1;
      for (let y = 0; y < size; y += 32) for (let x = -32; x < size; x += 64) ctx.strokeRect(x + (y % 64 ? 32 : 0), y, 64, 32);
    }
  });
}

/** A matched albedo/emission pair: only occupied window panes emit light. */
export function facadeTextures(style) {
  const cells = []; const random = seededRandom(91 + style);
  for (let row = 0; row < 16; row++) for (let col = 0; col < 8; col++) cells.push({ row, col, lit: random() > 0.43, shade: random(), blind: random() > 0.77 });
  const map = canvasTexture(512, ctx => {
    ctx.fillStyle = ['#879b9d', '#c5c0b2', '#b5aaa0'][style]; ctx.fillRect(0, 0, 512, 512);
    cells.forEach(({ row, col, shade, blind }) => {
      const x = col * 64, y = row * 32;
      ctx.fillStyle = style === 0 ? `hsl(199 19% ${25 + shade * 22}%)` : `hsl(201 17% ${20 + shade * 15}%)`;
      ctx.fillRect(x + 5, y + 4, 54, 23);
      const gradient = ctx.createLinearGradient(x, y, x + 50, y + 30); gradient.addColorStop(0, 'rgba(197,222,227,0.32)'); gradient.addColorStop(1, 'rgba(19,40,52,0.05)'); ctx.fillStyle = gradient; ctx.fillRect(x + 5, y + 4, 54, 23);
      ctx.fillStyle = '#687a7c'; ctx.fillRect(x + 31, y + 4, 2, 23);
      if (blind) { ctx.fillStyle = '#89918c'; ctx.fillRect(x + 6, y + 4, 52, 8); }
      ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fillRect(x, y + 29, 64, 3);
    });
  });
  const emissiveMap = canvasTexture(512, ctx => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 512, 512);
    cells.filter(cell => cell.lit).forEach(({ row, col, shade, blind }) => {
      ctx.fillStyle = shade > 0.6 ? '#f9d8a0' : '#a7bdc4'; ctx.fillRect(col * 64 + 6, row * 32 + (blind ? 12 : 5), 52, blind ? 14 : 21);
      ctx.fillStyle = '#000'; ctx.fillRect(col * 64 + 31, row * 32, 2, 32);
    });
  });
  return { map, emissiveMap };
}

export function glowTexture() {
  return canvasTexture(64, ctx => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,0.65)'); gradient.addColorStop(0.3, 'rgba(255,255,255,0.22)'); gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  });
}

/** Alpha-cut foliage cards keep irregular leaf silhouettes at a small GPU cost. */
export function foliageTexture() {
  const random=seededRandom(718);
  return canvasTexture(256,ctx=>{
    for(let i=0;i<1800;i++) {
      const angle=random()*Math.PI*2, radius=Math.sqrt(random());
      const x=128+Math.cos(angle)*radius*119, y=128+Math.sin(angle)*radius*115;
      const light=25+random()*28;
      ctx.fillStyle=`hsl(${80+random()*24} 28% ${light}%)`;
      ctx.beginPath(); ctx.ellipse(x,y,2+random()*4,1+random()*2,random()*Math.PI,0,Math.PI*2); ctx.fill();
    }
  });
}
