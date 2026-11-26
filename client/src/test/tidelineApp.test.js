import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';

it('plays through the phone interface, pauses and resumes, mutes, and saves before accepting an update',async()=>{
  const html=readFileSync('public/tideline/index.html','utf8');
  document.body.innerHTML=new DOMParser().parseFromString(html,'text/html').body.innerHTML;
  const el=id=>document.getElementById(id), click=id=>el(id).click();
  const gradient={addColorStop:vi.fn()};
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue(new Proxy({},{
    get:(_,k)=> k==='createLinearGradient'?()=>gradient:()=>{},set:()=>true,
  }));
  vi.stubGlobal('ResizeObserver',class{observe(){}});
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('isSecureContext',true);
  el('help').showModal=()=>{el('help').open=true;}; el('help').close=()=>{el('help').open=false;};
  const waiting={postMessage:vi.fn()}, reg=Object.assign(new EventTarget(),{waiting,installing:null});
  const sw=Object.assign(new EventTarget(),{controller:{},register:vi.fn(async()=>reg),ready:Promise.resolve(reg)});
  Object.defineProperty(navigator,'serviceWorker',{value:sw,configurable:true});
  const callbacks=new Map();let serial=0,now=0;
  vi.stubGlobal('requestAnimationFrame',fn=>{callbacks.set(++serial,fn);return serial;});
  vi.stubGlobal('cancelAnimationFrame',id=>callbacks.delete(id));
  function frames(n){for(let i=0;i<n;i++){now+=1000/30;const work=[...callbacks.values()];callbacks.clear();work.forEach(fn=>fn(now));}}
  const key=(type,code)=>window.dispatchEvent(new KeyboardEvent(type,{code}));
  localStorage.clear();
  await import('../../public/tideline/app.js');await Promise.resolve();
  expect(sw.register).toHaveBeenCalledWith('./sw.js',expect.objectContaining({scope:'./'}));
  click('how');expect(el('help').open).toBe(true);click('close');
  click('install');expect(el('helpTitle').textContent).toBe('Install Tideline');click('close');
  const prompt=Object.assign(new Event('beforeinstallprompt',{cancelable:true}),{prompt:vi.fn(async()=>{}),userChoice:Promise.resolve({outcome:'accepted'})});
  window.dispatchEvent(prompt);click('install');expect(prompt.prompt).toHaveBeenCalledOnce();
  click('sound');click('start');frames(1);
  key('keydown','ArrowRight');frames(35);click('pause');key('keyup','ArrowRight');
  const saved=()=>JSON.parse(localStorage.getItem('tideline.pilot.v1'));
  expect(saved().flight.x).toBeGreaterThan(265);expect(saved().muted).toBe(true);
  const charge=saved().flight.charge;frames(90);expect(saved().flight.charge).toBe(charge);
  click('start');frames(2);expect(el('deck').dataset.mode).toBe('flight');
  click('update');expect(waiting.postMessage).toHaveBeenCalledWith('ACTIVATE');
  expect(el('title').textContent).toBe('Flight paused');expect(saved().flight.charge).toBeLessThan(charge);
  click('restart');frames(1);click('pause');expect(saved().flight.x).toBe(245);
  window.dispatchEvent(new Event('appinstalled'));expect(el('install').hidden).toBe(true);
  localStorage.clear();delete navigator.serviceWorker;vi.restoreAllMocks();vi.unstubAllGlobals();
});
