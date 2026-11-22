import React from 'react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { act,cleanup,fireEvent,render,screen } from '@testing-library/react';
import LiveStation from '../components/views/LiveStation.jsx';
import { stationAction,useStation } from '../services/liveStation.js';

let socket;
const position={latitude:1,longitude:2,relativeAltitude:4},home={latitude:1.001,longitude:2,altitude:10};
const frame={type:'GCS_STATE',sessionId:'one',identity:{supported:true,systemId:42,componentId:1,vehicleType:2},version:{version:'4.5.7',capabilities:'0'},link:{aircraft:true,ages:{position:0}},control:{enabled:true,owned:true,owner:true},safety:{status:'UNVERIFIED'},home,position,positionValid:true,heartbeat:{isArmed:true,flightMode:'LOITER'},parameters:{},warnings:[],heading:359,guidance:{distance:111,bearing:0,relativeBearing:1}};
const receive=data=>act(()=>socket.onmessage({data:JSON.stringify(data)}));
function sample(data) {
  act(()=>vi.advanceTimersByTime(200));
  const req=socket.sent.filter(m=>m.type==='SAMPLE').at(-1);
  receive({...data,nonce:req.nonce});
}
beforeEach(()=>{
  vi.useFakeTimers();window.history.replaceState({},'', '/live');
  vi.stubEnv('VITE_WS_URL','ws://127.0.0.1:8080');
  vi.stubGlobal('WebSocket',class { static OPEN=1;readyState=1;sent=[];constructor(){socket=this;}close(){}send(w){this.sent.push(JSON.parse(w));}});
  render(<LiveStation/>);act(()=>socket.onopen());receive(frame);
});
afterEach(()=>{cleanup();window.history.replaceState({},'', '/');vi.unstubAllGlobals();vi.unstubAllEnvs();vi.useRealTimers();vi.restoreAllMocks();});
it('shows confirmed HOME and a heading-relative HUD, requires confirmation and suppresses stale cues',()=>{
  sample(frame);
  expect(screen.getByText('111 m to home')).toBeInTheDocument();
  expect(screen.getByLabelText('Home direction')).toHaveStyle({transform:'rotate(1deg)'});
  const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('button',{name:'Return to home / RTL'}));
  expect(socket.sent.some(m=>m.type==='RTL')).toBe(false);
  confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'Return to home / RTL'}));
  expect(socket.sent.at(-1)).toMatchObject({context:'LIVE',sessionId:'one',confirm:true,type:'RTL'});
  act(()=>vi.advanceTimersByTime(1400));
  expect(screen.getByText('Home not confirmed')).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Return to home / RTL'})).toBeDisabled();
});
it('discards queued old states and cannot send after navigating to replay, even before unmount',()=>{
  sample(frame);
  act(()=>vi.advanceTimersByTime(200));
  const oldNonce=socket.sent.filter(m=>m.type==='SAMPLE').at(-1).nonce;
  sample({...frame,sessionId:'two',home:null,guidance:null,control:{enabled:true,owned:false,owner:false}});
  receive({...frame,nonce:oldNonce});
  expect(useStation.getState().state.sessionId).toBe('two');expect(screen.getByText('Home not confirmed')).toBeInTheDocument();
  window.history.replaceState({},'', '/environment');
  expect(stationAction({type:'CLAIM_CONTROL'})).toBe(false);
  expect(socket.sent.some(m=>m.type==='CLAIM_CONTROL')).toBe(false);
});

it('shows a measured radius crossing independently of a breach reported by the autopilot',()=>{
  sample({...frame,safety:{...frame.safety,warningState:'BREACH'},fence:{breached:false}});
  expect(screen.getByText('Measured distance has reached the configured radius.')).toBeInTheDocument();
  expect(screen.queryByText('Autopilot reports a fence breach.')).toBeNull();
  sample({...frame,safety:{...frame.safety,warningState:'NORMAL'},fence:{breached:true}});
  expect(screen.getByText('Autopilot reports a fence breach.')).toBeInTheDocument();
  expect(screen.queryByText('Measured distance has reached the configured radius.')).toBeNull();
});

