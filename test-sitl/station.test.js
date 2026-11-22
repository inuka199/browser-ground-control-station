import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { access, mkdtemp, open } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { startBridge } from '../bridge.js';

function waitFor(ws, description, matches, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const finish = (error, message) => {
      clearTimeout(timer);
      ws.off('message', received).off('close', closed).off('error', failed);
      if (error) reject(error); else resolve(message);
    };
    const received = raw => {
      const m = JSON.parse(raw);
      if (matches(m)) finish(null, m);
    };
    const closed = () => finish(Error('WebSocket closed awaiting ' + description));
    const failed = error => finish(error);
    const timer = setTimeout(() => finish(Error('Timed out awaiting ' + description)), timeout);
    ws.on('message', received).once('close', closed).once('error', failed);
  });
}

test('real Copter SITL reports home, rejects disarmed RTL, releases the browser and recovers after reboot', {timeout: 200000}, async t => {
  const root = process.env.ARDUPILOT_ROOT || path.join(homedir(), 'ardupilot');
  const binary = path.resolve(root, 'build/sitl/bin', process.platform === 'win32' ? 'arducopter.exe' : 'arducopter');
  const defaults = path.resolve(root, 'Tools/autotest/default_params/copter.parm');
  try { await access(binary, constants.X_OK); await access(defaults, constants.R_OK); }
  catch { throw Error('A built ArduCopter SITL checkout is required. Set ARDUPILOT_ROOT. Looked for ' + binary + ' and ' + defaults); }

  const folder = await mkdtemp(path.join(tmpdir(), 'gcs-sitl-'));
  t.diagnostic('SITL console and onboard log directory: ' + folder);
  const log = await open(path.join(folder, 'sitl-console.log'), 'a');
  const b = startBridge({UDP_HOST:'127.0.0.1', WS_HOST:'127.0.0.1', UDP_PORT:'0', WS_PORT:'0', GCS_ALLOW_CONTROL:'1'});
  let child;
  const sockets = new Set();
  async function stopCopter() {
    if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    const exit = once(child, 'exit');
    child.kill('SIGTERM');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 3000);
    try { await exit; } finally { clearTimeout(timeout); }
  }
  t.after(async () => {
    for (const ws of sockets) ws.terminate();
    try { await stopCopter(); } finally { b.close(); await log.close(); }
  });
  await Promise.all([once(b.server,'listening'), once(b.udp,'listening')]);

  function openStation() {
    const ws = new WebSocket('ws://127.0.0.1:' + b.server.address().port + '/live', {origin:'http://localhost:5173'});
    sockets.add(ws);
    return ws;
  }
  async function boot() {
    child = spawn(binary, ['--model','+', '-I42', '--speedup','1', '--defaults',defaults,
      '--serial0=udpclient:127.0.0.1:' + b.udp.address().port], {cwd:folder, stdio:['ignore',log.fd,log.fd]});
    await once(child, 'spawn');
  }
  const state = (ws, description, match, timeout) => waitFor(ws, description, m => m.type === 'GCS_STATE' && match(m), timeout);
  const ready = ws => state(ws, 'healthy disarmed Copter and confirmed HOME_POSITION',
    s => s.identity?.supported && s.version && s.home?.source === 'HOME_POSITION' && s.positionValid && s.heartbeat?.isArmed === false, 70000);
  const pilot = openStation();
  await state(pilot, 'empty bridge', s => s.home === null && !s.link.aircraft);
  await boot();
  const first = await ready(pilot);
  t.diagnostic('Firmware ' + first.version.version + ', system/component ' + first.identity.systemId + '/' + first.identity.componentId);

  const lease = state(pilot, 'exclusive control', s => s.control.owned);
  pilot.send(JSON.stringify({type:'CLAIM_CONTROL', context:'LIVE', sessionId:first.sessionId}));
  await lease;
  const rejected = waitFor(pilot, 'disarmed RTL rejection', m => m.type === 'COMMAND_STATUS' && m.requestId === 'disarmed-rtl');
  pilot.send(JSON.stringify({type:'RTL', context:'LIVE', sessionId:first.sessionId, requestId:'disarmed-rtl', confirm:true}));
  assert.equal((await rejected).status, 'REJECTED');
  const closed = once(pilot, 'close'); pilot.close(); await closed;

  const replacement = openStation();
  const freshSession = await state(replacement, 'reconnected observer without previous home', s => !s.control.owner && s.home === null);
  assert.equal(freshSession.sessionId, first.sessionId);
  await ready(replacement);
  await stopCopter();
  const lost = await state(replacement, 'loss of aircraft heartbeat', s => !s.link.aircraft);
  assert.equal(lost.home, null); assert.equal(lost.guidance, null);
  await boot();
  const recovered = await ready(replacement);
  assert.notEqual(recovered.sessionId, first.sessionId);
  assert.equal(recovered.control.owner, false);
  assert.equal(recovered.pending, null);
});
