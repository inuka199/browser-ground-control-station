import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {advance,launch,distance,score,STOPS,savePilot,readPilot} from '../client/public/tideline/game.js';

const path=new URL('../client/public/tideline/',import.meta.url);
const tick=(f,input,n=1)=>{for(let i=0;i<n;i++)advance(f,input,1/30);};
test('a player can survey in order, interrupt a scan, dock and receive a battery bonus',()=>{
  const f=launch();
  for(let leg=0;leg<STOPS.length;leg++){
    const target=STOPS[leg];
    for(let i=0;distance(f)>20 && i<1400;i++){
      const d=distance(f);tick(f,{x:(target.x-f.x)/d,y:(target.y-f.y)/d,scan:false});
    }
    assert.ok(distance(f)<=20);
    tick(f,{x:0,y:0,scan:true},15);
    assert.ok(f.scan>0 && f.leg===leg);
    tick(f,{x:0,y:0,scan:false});assert.equal(f.scan,0);
    tick(f,{x:0,y:0,scan:true},43);assert.equal(f.leg,leg+1);
  }
  assert.equal(f.status,'complete');assert.ok(score(f)>1250);
  const final={...f};tick(f,{x:1,y:1,scan:true},90);assert.deepEqual(f,final);
});
test('scanning out of range cannot win and depletion ends flight',()=>{
  const f=launch();tick(f,{x:0,y:0,scan:true},3010);
  assert.equal(f.leg,0);assert.equal(f.status,'empty');assert.equal(f.charge,0);
});
test('checkpoint preserves mission and settings while clearing a held action; damaged saves recover',()=>{
  const storage={setItem(k,v){this[k]=v;},getItem(k){return this[k];}};
  const flight={...launch(),leg:2,charge:42,x:703,y:322,vx:19,scan:.8};
  assert.ok(savePilot(storage,{flight,best:987,muted:true}));
  assert.deepEqual(readPilot(storage),{muted:true,best:987,flight:{...flight,vx:0,scan:0}});
  savePilot(storage,{flight:{...flight,leg:9},best:750,muted:true});
  assert.deepEqual(readPilot(storage),{muted:true,best:750,flight:null});
  storage.getItem=()=>'{oops';assert.equal(readPilot(storage).flight,null);
  assert.equal(savePilot(undefined,{}),false);
});

test('the release worker precaches every required game asset, serves it offline and confines routing to the game',async()=>{
  const scope='https://example.test/tideline/', manifest=JSON.parse(await readFile(new URL('app.webmanifest',path)));
  const listeners={},stored=new Map(),deleted=[];
  const cache={
    async addAll(requests){
      const batch=[];
      for(const req of requests){
        const name=new URL(req.url).pathname.split('/').pop(), bytes=await readFile(new URL(name,path));
        assert.equal(req.integrity,'sha256-'+createHash('sha256').update(bytes).digest('base64'),name);
        batch.push([req.url,bytes]);
      }
      for(const [key,val] of batch)stored.set(key,val);
    },
    match:key=>stored.get(key),
  };
  let claimed=false,activated=false,cacheName;
  const self={registration:{scope},addEventListener:(name,cb)=>{listeners[name]=cb;},
    clients:{claim:()=>{claimed=true;}},skipWaiting:()=>{activated=true;}};
  const caches={open:name=>{cacheName=name;return cache;},keys:()=>[cacheName,'tideline:/tideline/:old','station:/live/'],
    delete:name=>deleted.push(name)};
  vm.runInNewContext(await readFile(new URL('sw.js',path),'utf8'),{self,caches,URL,Request,fetch:()=>{throw Error('offline');}});
  const run=(name,extra={})=>{let work;listeners[name]({...extra,waitUntil:p=>{work=p;},respondWith:p=>{work=p;}});return work;};
  await run('install');assert.equal(activated,false);
  const html=stored.get(new URL(manifest.start_url,scope).href).toString();
  const pending=[...html.matchAll(/(?:src|href)="\.\/([^"]+)"/g)].map(m=>m[1]);
  for(const [key,body] of stored)if(key.endsWith('.js'))pending.push(...[...body.toString().matchAll(/from ['"]\.\/([^'"]+)/g)].map(m=>m[1]));
  for(const name of pending)assert.ok(stored.has(scope+name),name);
  for(const icon of manifest.icons){
    const data=stored.get(new URL(icon.src,scope).href);
    assert.equal(data.readUInt32BE(16)+'x'+data.readUInt32BE(20),icon.sizes);
  }
  const nav=(url,mode='navigate')=>run('fetch',{request:{url,mode,method:'GET'}});
  assert.equal((await nav(scope+'?launch=1')).toString(),html);
  assert.ok(await nav(scope+'chart.js','cors'));
  assert.equal(nav('https://example.test/live'),undefined);
  assert.equal(nav(scope+'unlisted.js','cors'),undefined);
  await run('message',{data:'ACTIVATE'});assert.equal(activated,true);
  await run('activate');assert.equal(claimed,true);assert.deepEqual(deleted,['tideline:/tideline/:old']);
});
