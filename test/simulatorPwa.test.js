import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import simulatorPwa from '../client/build/simulatorPwa.js';

test('offline game installs its exact imports, serves a cold game navigation and stages an update without replacing a running build', async t => {
  const dir=await mkdtemp(join(tmpdir(),'nexus-pwa-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const origin='https://game.example';
  const paths=['/simulator','/garage','/challenges'];
  const sourceKeys=['index.html','src/components/simulator/SimulatorPage.jsx','src/components/simulator/DroneGarage.jsx','src/components/views/ChallengesView.jsx'];
  const manifest={};
  for (const [i,key] of sourceKeys.entries()) manifest[key]={file:'entry'+i+'.js',imports:['shared'],css:['game.css']};
  manifest.shared={file:'shared.js'};
  manifest.live={file:'station.js'};
  manifest['index.html'].dynamicImports=['live',...sourceKeys.slice(1)];
  await mkdir(join(dir,'.vite'));
  await mkdir(join(dir,'simulator-pwa'));
  await writeFile(join(dir,'.vite/manifest.json'),JSON.stringify(manifest));
  for (const file of ['index.html','favicon.svg','game.css','shared.js','station.js',...sourceKeys.map((_,i)=>'entry'+i+'.js')]) await writeFile(join(dir,file),file+' v1');
  for(const name of ['flight.webmanifest','icon-192.png','icon-512.png','maskable-512.png']) await writeFile(join(dir,'simulator-pwa',name),await readFile(new URL('../client/public/simulator-pwa/'+name,import.meta.url)));
  const app=JSON.parse(await readFile(join(dir,'simulator-pwa/flight.webmanifest')));
  assert.equal(app.start_url,'/simulator');assert.equal(app.display,'standalone');
  assert.equal(app.orientation,'landscape');
  for(const icon of app.icons) {
    const bytes=await readFile(join(dir,'simulator-pwa',icon.src));
    assert.equal(bytes.readUInt32BE(16)+'x'+bytes.readUInt32BE(20),icon.sizes);
  }
  const all=new Map();
  const caches={keys:async()=>[...all.keys()],delete:key=>all.delete(key),open:async key=>{
    if(!all.has(key)){
      const data=new Map();
      all.set(key,{match:url=>data.get(url),keys:async()=>[...data.keys()].map(url=>({url})),addAll:async requests=>{
        const batch=await Promise.all(requests.map(async req=>{
          const content=await readFile(join(dir,new URL(req.url).pathname.slice(1)));
          assert.equal(req.credentials,'same-origin');assert.equal(req.redirect,'error');
          assert.equal('sha256-'+createHash('sha256').update(content).digest('base64'),req.integrity);
          return [req.url,content.toString()];
        }));
        for(const [url,bytes] of batch)data.set(url,bytes);
      }});
    }
    return all.get(key);
  }};
  await caches.open('unrelated');
  let clientPath='/simulator';
  let otherTabs=[], skips=0;
  async function release() {
    await simulatorPwa().writeBundle({dir});
    const events={};
    vm.runInNewContext(await readFile(join(dir,'simulator-worker.js'),'utf8'),{
      caches,URL,Request,Response,fetch:()=>Promise.reject(Error('offline')), self:{location:{origin},
        clients:{get:async()=>({url:origin+clientPath}),claim:()=>{},matchAll:async()=>[{id:'tab'},...otherTabs]},
        skipWaiting:async()=>{skips++;},
        addEventListener:(type,fn)=>{events[type]=fn}}
    });
    function lifecycle(event){let done;events[event]({waitUntil:p=>{done=p;}});return done;}
    function request(path,mode='navigate'){
      let reply;events.fetch({request:{url:origin+path,method:'GET',mode},clientId:'tab',respondWith:p=>{reply=p;}});
      return mode === 'navigate' && reply ? reply.then(response => response.text()) : reply;
    }
    async function message(data) {
      let reply, done;
      events.message({data,source:{id:'tab',url:origin+clientPath},ports:[{postMessage:value=>{reply=value;}}],waitUntil:p=>{done=p;}});
      await done;
      return reply;
    }
    return {lifecycle,request,message};
  }
  const first=await release();
  assert.equal(await first.message('CHECK'),'INCOMPLETE');
  await first.lifecycle('install');await first.lifecycle('activate');
  assert.equal(await first.message('CHECK'),'COMPLETE');
  assert.equal(first.request('/index.html','cors'),undefined);
  assert.equal(await first.request('/simulator/'),'index.html v1');
  for(const path of paths)assert.equal(await first.request(path+'?offline=1'),'index.html v1');
  assert.equal(await first.request('/shared.js','cors'),'shared.js v1');
  for(const outside of ['/live','/api/login','/simulator?launch=live','/']) assert.equal(first.request(outside),undefined);
  assert.equal(first.request('/station.js','cors'),undefined);
  clientPath='/live';await assert.rejects(first.request('/shared.js','cors'),/offline/);clientPath='/simulator';
  await writeFile(join(dir,'index.html'),'index.html v2');
  const next=await release();
  await writeFile(join(dir,'game.css'),'authentication page');
  await assert.rejects(next.lifecycle('install'));
  assert.equal(await next.message('CHECK'),'INCOMPLETE');
  assert.equal(await first.request('/simulator'),'index.html v1');
  await writeFile(join(dir,'game.css'),'game.css v1');assert.equal(await next.message('REPAIR'),'COMPLETE');
  otherTabs=[{id:'second-game'}];assert.equal(await next.message('ACTIVATE'),'OTHER_TABS');assert.equal(skips,0);
  otherTabs=[];clientPath='/live';assert.equal(await next.message('ACTIVATE'),undefined);assert.equal(skips,0);
  clientPath='/simulator';assert.equal(await next.message('ACTIVATE'),'ACTIVATING');assert.equal(skips,1);
  assert.equal(await first.request('/simulator'),'index.html v1');
  await next.lifecycle('activate');assert.equal(await next.request('/simulator'),'index.html v2');
  assert.equal(all.size,2);assert.ok(all.has('unrelated'));
});
