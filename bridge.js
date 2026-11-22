import dgram from 'node:dgram';
import http from 'node:http';
import https from 'node:https';
import { readFileSync } from 'node:fs';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { ControlEngine } from './bridge/controlEngine.js';
import { encode, decodeDatagram } from './bridge/protocol.js';

const loopback = host => ['127.0.0.1','localhost','::1'].includes(host);
const defaultOrigins = ['http://localhost:5173','http://127.0.0.1:5173','http://localhost:4173','http://127.0.0.1:4173'];
function integer(value, fallback, min, max) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw Error('Invalid numeric bridge configuration');
  return n;
}
export function startBridge(env = process.env, {localPipe, udpSocket} = {}) {
  const host = env.WS_HOST || '127.0.0.1', udpHost = env.UDP_HOST || '127.0.0.1';
  const wsPort = integer(env.WS_PORT,8080,0,65535), udpPort = integer(env.UDP_PORT,14550,0,65535);
  const token = env.GCS_TOKEN || '';
  const tls = env.GCS_TLS_CERT && env.GCS_TLS_KEY;
  const remote = !loopback(host);
  if (remote && (!tls || token.length < 32 || !env.GCS_ORIGINS)) throw Error('Remote WebSocket access requires TLS, a 32-character token and exact allowed origins.');
  if (!loopback(udpHost) && !env.DRONE_ROUTER_IP) throw Error('Set DRONE_ROUTER_IP to the trusted MAVLink router.');
  const origins = new Set(env.GCS_ORIGINS ? env.GCS_ORIGINS.split(',').map(x=>x.trim()) : defaultOrigins);
  for (const origin of origins) {
    const url=new URL(origin);
    if(url.origin!==origin || (!loopback(url.hostname) && (!tls || token.length<32 || url.protocol!=='https:'))) throw Error('Remote origins require HTTPS, bridge TLS and token authentication.');
  }
  const application = (_req,res) => { res.writeHead(404); res.end(); };
  const server = tls ? https.createServer({cert:readFileSync(env.GCS_TLS_CERT),key:readFileSync(env.GCS_TLS_KEY)},application) : http.createServer(application);
  const wss = new WebSocketServer({noServer:true,maxPayload:8192,perMessageDeflate:false});
  const udp = udpSocket ?? dgram.createSocket('udp4'), clients = new Map(), diagnostics = {};
  let sequence = 0, lastBroadcast = -Infinity;
  const send = (id,msg) => {
    const ws=clients.get(id);
    if(ws?.readyState!==WebSocket.OPEN) return;
    if(ws.bufferedAmount>65536) {ws.terminate();return;}
    ws.send(JSON.stringify(msg));
  };
  const engine = new ControlEngine({
    allowControl:env.GCS_ALLOW_CONTROL==='1',systemId:env.DRONE_SYSTEM_ID?integer(env.DRONE_SYSTEM_ID,1,1,254):null,
    emit:send,
    send(name,fields,ep) {
      const packet = encode(name,fields,{sequence:sequence++});
      udp.send(packet,ep.port,ep.address,error=>{if(error) engine.release('UDP send failed: '+error.message);});
    }
  });
  server.on('upgrade',(req,socket,head)=>{
    if (!origins.has(req.headers.origin) || !['/','/observe','/live'].includes(req.url)) {socket.destroy();return;}
    wss.handleUpgrade(req,socket,head,ws=>wss.emit('connection',ws,req));
  });
  wss.on('connection',(ws,req)=>{
    const id=randomUUID(), live=req.url==='/live';
    let authenticated=!token, count=0, windowStart=performance.now();
    function activate() {clients.set(id,ws);engine.addClient(id);if(live)engine.handle(id,{type:'SET_CONTEXT',context:'LIVE'});send(id,engine.snapshot(id));}
    if(authenticated)activate();else ws.send(JSON.stringify({type:'AUTH_REQUIRED'}));
    const authTimeout=setTimeout(()=>{if(!authenticated)ws.close(1008,'Authentication timed out');},60000);
    ws.on('message',(raw,binary)=>{
      if(binary){ws.close(1003);return;}
      if(performance.now()-windowStart>=1000){count=0;windowStart=performance.now();}
      if(++count>30){ws.close(1008,'Rate limit');return;}
      let msg;try{msg=JSON.parse(raw);}catch{ws.close(1007);return;}
      if(!authenticated){
        const given=Buffer.from(typeof msg?.token==='string'?msg.token:''), expected=Buffer.from(token);
        if(msg?.type!=='AUTH'||given.length!==expected.length||!timingSafeEqual(given,expected)){ws.close(1008,'Authentication failed');return;}
        authenticated=true;activate();return;
      }
      if(msg?.type==='SAMPLE' && typeof msg.nonce==='string' && msg.nonce.length<=64){
        send(id,{...engine.snapshot(id),nonce:msg.nonce});return;
      }
      if(!live || msg?.type==='SET_CONTEXT') {send(id,{type:'COMMAND_STATUS',status:'REJECTED',message:'This connection cannot change control context.'});return;}
      engine.handle(id,msg);
    });
    ws.on('close',()=>{clearTimeout(authTimeout);engine.removeClient(id);clients.delete(id);});
    ws.on('error',()=>ws.terminate());
  });
  udp.on('message',(bytes,ep)=>{
    if(env.DRONE_ROUTER_IP && ep.address!==env.DRONE_ROUTER_IP)return;
    for(const message of decodeDatagram(bytes,diagnostics))engine.ingest(message,ep);
  });
  udp.on('error',error=>{engine.release('UDP error');console.error(error.message);});
  const timer=setInterval(()=>{
    engine.tick();
    if(performance.now()-lastBroadcast<100)return;
    lastBroadcast=performance.now();
    for(const id of clients.keys())send(id,engine.snapshot(id));
  },50);
  if (localPipe) server.listen(localPipe);
  else server.listen(wsPort,host);
  udp.bind(udpPort,udpHost);
  function close() {clearInterval(timer);engine.release('Bridge stopped');for(const ws of wss.clients)ws.terminate();wss.close();server.close();udp.close();}
  return {server,udp,close,engine};
}
if(process.argv[1] && pathToFileURL(process.argv[1]).href===import.meta.url){
  const bridge=startBridge();
  bridge.server.on('listening',()=>console.log('WebSocket bridge listening',bridge.server.address()));
  bridge.udp.on('listening',()=>console.log('MAVLink receiver listening',bridge.udp.address()));
  process.once('SIGINT',bridge.close);process.once('SIGTERM',bridge.close);
}
