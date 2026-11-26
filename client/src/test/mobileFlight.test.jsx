import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SimulatorPage from '../components/simulator/SimulatorPage.jsx';
import { useSimulatorStore } from '../store/slices/simulator.js';
import { demoInput } from '../components/simulator/demoInput.js';
import { stepFlight, createFlight } from '../components/simulator/flightDynamics.js';
import { readFlightPosition, saveFlightPosition } from '../components/simulator/mobileFlight.js';

vi.mock('../components/simulator/SimulatorWorld.jsx', () => ({
  default: ({savedFlight}) => <output data-testid="saved">{JSON.stringify(savedFlight)}</output>
}));
vi.mock('../components/simulator/flightAudio.js', () => ({
  enableFlightAudio: vi.fn(), stopFlightAudio: vi.fn(), playFlightEffect: vi.fn()
}));
let frame, now, portrait, standalone, touch;
function tick(count=1) {
  for (let i=0; i<count; i++) { now+=16; act(()=>frame(now)); }
}
function start(route='/simulator') {
  render(<MemoryRouter initialEntries={[route]}><Routes>
    <Route path="/simulator" element={<SimulatorPage/>}/>
    <Route path="/" element={<div>Left simulator</div>}/>
  </Routes></MemoryRouter>);
}
function rotate(upright) {
  portrait = upright;
  fireEvent(window,new Event('orientationchange'));
}
function pointer(pad, type, id, x, y) {
  const event=new MouseEvent(type,{bubbles:true,clientX:x,clientY:y,button:0});
  Object.defineProperty(event,'pointerId',{value:id});
  fireEvent(pad,event);
}
beforeEach(()=>{
  localStorage.clear();
  now=0;
  portrait=false; standalone=false; touch=true;
  vi.spyOn(performance,'now').mockImplementation(()=>now);
  vi.stubGlobal('matchMedia', q=>({matches:q.includes('coarse') ? touch : q.includes('portrait') ? portrait : q.includes('standalone') && standalone,addEventListener(){},removeEventListener(){}}));
  vi.stubGlobal('requestAnimationFrame', cb=>{frame=cb;return 1;});
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  useSimulatorStore.setState({isPaused:false,isDestroyed:false,isHudVisible:true,flightSource:'demo'});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('flies with both thumbs, releases individual cancelled pointers and pauses on rotation or backgrounding',()=>{
  start();
  expect(screen.getByText('Your first touch flight')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Start flight'}));
  function sticks() {
    const pads=[screen.getByRole('group',{name:'Throttle and yaw'}),screen.getByRole('group',{name:'Forward and sideways flight'})];
    for(const pad of pads) {
      pad.setPointerCapture=vi.fn();
      pad.getBoundingClientRect=()=>({left:0,top:0,width:100,height:100});
    }
    return pads;
  }
  let [left,right]=sticks();
  pointer(left,'pointerdown',11,75,25);
  pointer(right,'pointerdown',12,75,25);
  tick(55);
  const flight=stepFlight(createFlight(),demoInput,0.05);
  expect(flight.y).toBeGreaterThan(0);expect(flight.x).toBeGreaterThan(0);
  expect(flight.z).toBeLessThan(0);expect(flight.yaw).toBeLessThan(0);
  pointer(left,'pointerdown',99,0,90);
  pointer(left,'pointercancel',99,0,90);
  tick();expect(demoInput.throttle).toBeGreaterThan(.6);
  pointer(right,'lostpointercapture',12,75,25);
  tick(100);expect(demoInput.roll).toBe(0);expect(demoInput.pitch).toBe(0);
  expect(demoInput.throttle).toBeGreaterThan(.6);
  pointer(right,'pointerdown',15,75,25);tick(50);
  expect(demoInput.roll).toBeGreaterThan(.6);
  rotate(true);
  expect(screen.getByText('Rotate your phone to play')).toBeVisible();
  expect(screen.getByRole('dialog',{name:'Pause menu'})).toBeVisible();
  expect(Object.values(demoInput).every(value=>value===0)).toBe(true);
  rotate(false);
  expect(screen.queryByRole('group',{name:'Throttle and yaw'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));
  [left,right]=sticks();
  pointer(left,'pointerdown',13,50,80);tick(70);
  expect(stepFlight({...flight,y:0.05},demoInput,.05).grounded).toBe(true);
  pointer(left,'pointercancel',13,50,80);tick(90);expect(demoInput.throttle).toBe(0);
  pointer(right,'pointerdown',14,80,50);tick();
  fireEvent(window,new Event('pagehide'));
  expect(screen.getByRole('dialog')).toBeVisible();
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));tick();
  expect(Object.values(demoInput).every(v=>v===0)).toBe(true);
  fireEvent.change(screen.getByLabelText('Camera mode'),{target:{value:'fpv'}});
  expect(useSimulatorStore.getState().cameraMode).toBe('fpv');
});

it('restores a device checkpoint paused, keeps explicit launch links fresh, and tolerates damaged storage',()=>{
  const flight={x:4200,z:-300,y:170,yaw:.35,grounded:false};
  saveFlightPosition(flight,'port-city');
  localStorage.setItem('nexus-touch-guide-v1','1');
  start();
  expect(JSON.parse(screen.getByTestId('saved').textContent)).toEqual(flight);
  expect(useSimulatorStore.getState()).toMatchObject({launchPoint:'port-city',isPaused:true});
  cleanup();
  start('/simulator?launch=galle-face');
  expect(screen.getByTestId('saved')).toBeEmptyDOMElement();
  expect(useSimulatorStore.getState()).toMatchObject({launchPoint:'galle-face',isPaused:true});
  fireEvent.click(screen.getByRole('button',{name:'Start flight'}));
  expect(useSimulatorStore.getState().isPaused).toBe(false);
  localStorage.setItem('nexus-offline-flight-v1','{');
  expect(readFlightPosition()).toBeNull();
});

it.each([false, true])('requests landscape from a tap in a mobile session (standalone=%s)', async installed => {
  portrait=true; standalone=installed;
  const lock=vi.fn().mockResolvedValue(undefined), unlock=vi.fn();
  vi.stubGlobal('screen',{orientation:{lock,unlock}});
  start();
  const page=screen.getByLabelText('Flight Simulator');
  page.requestFullscreen=vi.fn().mockResolvedValue(undefined);
  expect(lock).not.toHaveBeenCalled();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start flight'})));
  expect(page.requestFullscreen).toHaveBeenCalledTimes(installed ? 0 : 1);
  expect(lock).toHaveBeenCalledWith('landscape');
  if (!installed) expect(page.requestFullscreen.mock.invocationCallOrder[0]).toBeLessThan(lock.mock.invocationCallOrder[0]);
  expect(screen.getByRole('heading',{name:'Rotate your phone to play'})).toBeVisible();
  fireEvent.keyDown(window,{code:'Escape'});
  expect(useSimulatorStore.getState().isPaused).toBe(true);
  rotate(false);
  expect(screen.getByRole('button',{name:'Resume'})).toBeVisible();
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Resume'})));
  expect(screen.getByRole('group',{name:'Throttle and yaw'})).toBeVisible();
  cleanup();
  expect(unlock).toHaveBeenCalled();
});

it.each(['unsupported','denied'])('keeps settings and exit usable in portrait when locking is %s',async mode=>{
  portrait=true;
  const lock=vi.fn().mockRejectedValue(new Error('Denied'));
  vi.stubGlobal('screen',{orientation:mode==='denied'?{lock}:{}});
  start();
  screen.getByLabelText('Flight Simulator').requestFullscreen=vi.fn().mockRejectedValue(new Error('Denied'));
  await act(async()=>fireEvent.click(screen.getByRole('button',{name:'Start flight'})));
  fireEvent.click(screen.getByRole('button',{name:/Flight settings/}));
  fireEvent.change(screen.getByLabelText('Graphics quality'),{target:{value:'low'}});
  expect(screen.getByLabelText('Graphics quality')).toHaveValue('low');
  expect(useSimulatorStore.getState().isPaused).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:/Back to GCS Dashboard/}));
  expect(screen.getByText('Left simulator')).toBeVisible();
});

it('keeps a backgrounded flight paused when a pending lock completes', async()=>{
  portrait=true; standalone=true;
  let finish;
  vi.stubGlobal('screen',{orientation:{lock:()=>new Promise(resolve=>{ finish=resolve; })}});
  start();
  fireEvent.click(screen.getByRole('button',{name:'Start flight'}));
  rotate(false);
  fireEvent(window,new Event('pagehide'));
  await act(async()=>finish());
  fireEvent(window,new Event('pageshow'));
  expect(useSimulatorStore.getState().isPaused).toBe(true);
  expect(screen.getByRole('button',{name:'Resume'})).toBeVisible();
});

it('keeps the simulator paused if the player restarts from the rotation pause menu',()=>{
  start();
  fireEvent.click(screen.getByRole('button',{name:'Start flight'}));
  rotate(true);
  rotate(false);
  fireEvent.click(screen.getByText('Flight actions'));
  fireEvent.click(screen.getByRole('button',{name:'Restart at launch point'}));
  expect(useSimulatorStore.getState().isPaused).toBe(true);
  expect(screen.queryByRole('group',{name:'Throttle and yaw'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Resume'}));
  expect(useSimulatorStore.getState().isPaused).toBe(false);
});

it('preserves keyboard flight and ignores portrait on desktop',()=>{
  touch=false; portrait=true;
  const lock=vi.fn();vi.stubGlobal('screen',{orientation:{lock}});
  start();expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.keyDown(window,{code:'KeyW'});tick(30);
  expect(demoInput.throttle).toBeGreaterThan(0);
  rotate(false);expect(useSimulatorStore.getState().isPaused).toBe(false);
  fireEvent.keyDown(window,{code:'Escape'});expect(screen.getByRole('button',{name:'Resume'})).toBeVisible();
  fireEvent.keyDown(window,{code:'Escape'});expect(screen.queryByRole('dialog')).toBeNull();
  expect(lock).not.toHaveBeenCalled();
});
