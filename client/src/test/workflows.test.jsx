import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { validatePath, flightMetrics, flightCSV } from '../services/flightRecords.js';
import { useSimulatorStore } from '../store/slices/simulator.js';
import { useRecordingStore } from '../store/slices/recording.js';
import { useChallengeStore } from '../store/slices/challenges.js';
import { missionPath, validateMission } from '../store/slices/mission.js';
import { useCommandStore } from '../store/slices/commands.js';
import { usePayloadStore } from '../store/slices/payload.js';
import { useAirspaceStore, joinAirspace, leaveAirspace, validPeer } from '../services/localAirspace.js';
import MissionEditor from '../components/views/MissionEditor.jsx';
import TrainingView from '../components/views/TrainingView.jsx';
import GadgetsView from '../components/views/GadgetsView.jsx';
import EnvironmentControls from '../components/simulator/EnvironmentControls.jsx';
import { useEnvironmentStore } from '../store/slices/environment.js';

const path = [{x:0,y:0,z:0,t:0},{x:10,y:0,z:0,t:1000},{x:20,y:0,z:0,t:9000}];
beforeEach(() => {
  useRecordingStore.setState({recordings:[],lastError:null});
  useSimulatorStore.setState({flownPath:[],isRecording:false,recordingSource:null});
  useChallengeStore.setState({active:null,results:{}});
  useCommandStore.setState({state:'idle',label:null,history:[]});
});
afterEach(() => { cleanup(); leaveAirspace(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

it('lets a pilot preview a storm, clear it and restore the automatic cycle from flight settings', () => {
  render(<EnvironmentControls compact />);
  fireEvent.keyDown(window, {code:'KeyI'});
  const weather=screen.getByRole('combobox',{name:/simulator weather/i});
  expect(weather).toHaveValue('auto');
  for(const mode of ['storm','clear','auto']){
    fireEvent.change(weather,{target:{value:mode}});
    expect(useEnvironmentStore.getState().weatherMode).toBe(mode);
    expect(weather).toHaveValue(mode);
  }
});

it('adjusts local cloud wind from flight settings, including a calm wind', () => {
  const original = useEnvironmentStore.getState().wind;
  try {
    render(<EnvironmentControls compact />);
    fireEvent.keyDown(window, {code:'KeyI'});
    const speed = screen.getByRole('slider',{name:'Cloud wind speed'});
    const direction = screen.getByRole('combobox',{name:'Clouds drift toward'});
    fireEvent.change(speed,{target:{value:'12'}});
    fireEvent.change(direction,{target:{value:'315'}});
    expect(useEnvironmentStore.getState().wind).toEqual({speedMs:12,directionDeg:315,appliedToSitl:false});
    fireEvent.change(speed,{target:{value:'0'}});
    expect(useEnvironmentStore.getState().wind.speedMs).toBe(0);
  } finally {
    useEnvironmentStore.setState({wind:original});
  }
});

describe('recordings and route replay', () => {
  it('rejects malformed, non-finite and out-of-order imports', () => {
    expect(validatePath(path)).toEqual(path);
    for (const bad of [null, [], [{x:0}], [path[1],path[0]], [path[0],{...path[1],y:NaN}]]) expect(()=>validatePath(bad)).toThrow();
  });
  it('interpolates by timestamps and reports travelled distance consistently', () => {
    const stats = flightMetrics(path, 0.5);
    expect(stats.position.x).toBeCloseTo(14.375);
    expect(stats.travelled).toBeCloseTo(14.375);
    expect(stats.duration).toBe(9);
    expect(flightMetrics(path,1).distance).toBe(20);
    expect(flightCSV(path)).toContain('elapsed_s,east_m,altitude_m,south_m\n0,0,0,0');
  });
  it('records stationary hover samples and saves exactly once on stop', () => {
    vi.spyOn(Date,'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const sim = useSimulatorStore.getState();
    sim.startRecording(); sim.recordPosition({x:0,y:10,z:0}); sim.recordPosition({x:0,y:10,z:0}); sim.stopRecording(); sim.stopRecording();
    expect(useRecordingStore.getState().recordings).toHaveLength(1);
    expect(useRecordingStore.getState().recordings[0].points).toHaveLength(2);
    expect(useSimulatorStore.getState().isRecording).toBe(false);
  });
  it('does not splice live and demo coordinates into one recording', () => {
    const sim = useSimulatorStore.getState(); sim.startRecording();
    sim.recordPosition({x:0,y:0,z:0,source:'demo'}); sim.recordPosition({x:0,y:10,z:0,source:'demo'});
    sim.recordPosition({x:100,y:20,z:200,source:'live'});
    expect(useSimulatorStore.getState().isRecording).toBe(false);
    expect(useRecordingStore.getState().recordings[0].source).toBe('demo');
    expect(useRecordingStore.getState().recordings[0].points.at(-1).x).toBe(0);
  });
  it('keeps the original library intact if storage cannot save', () => {
    const records = useRecordingStore.getState(); records.saveFlight(path,'compact-quad');
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('Quota exceeded');});
    expect(records.saveFlight(path,'compact-quad')).toBeNull();
    expect(useRecordingStore.getState().recordings).toHaveLength(1);
    expect(useRecordingStore.getState().lastError).toContain('Quota exceeded');
  });
  it('retains waypoint plan identity when previewed and archived', () => {
    useSimulatorStore.getState().loadFlownPath(path,'Inspection plan','plan');
    const sim = useSimulatorStore.getState();
    const record = useRecordingStore.getState().saveFlight(sim.flownPath,sim.droneModelId,sim.recordingSource,sim.routeLabel);
    expect(record.source).toBe('plan');
    expect(JSON.parse(sessionStorage.getItem('nexus-flight-recording')).source).toBe('plan');
  });
});

describe('mission planning and challenge completion', () => {
  it('validates local waypoints and creates a time-ordered preview', () => {
    expect(()=>validateMission([{x:'',y:10,z:0},{x:0,y:0,z:0}])).toThrow();
    expect(()=>validateMission([{x:0,y:-1,z:0},{x:0,y:0,z:0}])).toThrow();
    const preview = missionPath([{x:0,y:0,z:0},{x:0,y:20,z:0},{x:60,y:20,z:0}]);
    expect(preview.map(p=>p.t)).toEqual([0,2000,8000]);
  });
  it('requires a continuous hover and landing, rather than granting completion on launch', () => {
    const store = useChallengeStore.getState(); store.startChallenge('first-flight');
    const sample = {x:0,y:10,z:0,speed:0,climb:0,clearance:Infinity};
    store.observe(sample,.1); expect(useChallengeStore.getState().active.stage).toBe(1);
    for(let i=0;i<5;i++) store.observe(sample,.5);
    store.observe({...sample,climb:2},.5); expect(useChallengeStore.getState().active.hover).toBe(0);
    for(let i=0;i<6;i++) store.observe(sample,.5);
    expect(useChallengeStore.getState().active.stage).toBe(2);
    store.observe({...sample,y:0,x:20},.1); expect(useChallengeStore.getState().active).not.toBeNull();
    store.observe({...sample,y:0},.1); expect(useChallengeStore.getState().active).toBeNull();
    expect(useChallengeStore.getState().results['first-flight'].score).toBe(100);
  });
  it('counts one warning per proximity entry and leaves aborted challenges incomplete', () => {
    const store = useChallengeStore.getState(); store.startChallenge('coastal-circuit');
    const sample = {x:0,y:25,z:0,speed:0,clearance:2};
    store.observe(sample,.1); store.observe(sample,.1);
    expect(useChallengeStore.getState().active.warnings).toBe(1);
    store.observe({...sample,clearance:10},.1); store.observe(sample,.1);
    expect(useChallengeStore.getState().active.warnings).toBe(2);
    store.abortChallenge(); expect(useChallengeStore.getState().results).toEqual({});
  });
  it('shows validation feedback for an invalid waypoint and saves a corrected plan', () => {
    render(<MemoryRouter><MissionEditor/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Waypoint 1 altitude'),{target:{value:'-10'}});
    fireEvent.click(screen.getByText('Save plan')); expect(screen.getByRole('status')).toHaveTextContent('0–500');
    fireEvent.change(screen.getByLabelText('Waypoint 1 altitude'),{target:{value:'0'}});
    fireEvent.click(screen.getByText('Save plan')); expect(screen.getByRole('status')).toHaveTextContent('Plan saved');
  });
});

describe('connected page controls', () => {
  it('deduplicates bridge submission acknowledgements and updates the same command result', () => {
    const store = useCommandStore.getState(); store.setPending('GUIDED','Sending'); store.setPending('GUIDED','Submitted'); store.setSuccess('Confirmed');
    expect(useCommandStore.getState().history).toHaveLength(1);
    expect(useCommandStore.getState().history[0].status).toBe('CONFIRMED');
    store.setError('Bridge offline. No command was sent.');
    expect(useCommandStore.getState().history[0].status).toBe('CONFIRMED');
  });
  it('updates camera configuration and rangefinder from the gadgets form', () => {
    usePayloadStore.getState().reset();
    render(<MemoryRouter><GadgetsView/></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Camera field of view'),{target:{value:'85'}});
    fireEvent.click(screen.getByRole('checkbox'));
    expect(usePayloadStore.getState().fov).toBe(85); expect(usePayloadStore.getState().rangefinder).toBe(true);
    fireEvent.click(screen.getByText('Reset camera and sensor')); expect(usePayloadStore.getState().fov).toBe(60);
  });
  it('checks lesson answers and does not reward an incorrect answer', () => {
    render(<MemoryRouter><TrainingView/></MemoryRouter>);
    fireEvent.click(screen.getByLabelText('W and S')); fireEvent.click(screen.getAllByText('Check answer')[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Try again');
    fireEvent.click(screen.getByLabelText('A and D')); fireEvent.click(screen.getAllByText('Check answer')[0]);
    expect(screen.getByRole('status')).toHaveTextContent('Correct');
    expect(screen.getByText('1/3 lessons completed')).toBeInTheDocument();
  });
  it('joins local rooms, discovers peers and removes disconnected pilots', () => {
    vi.useFakeTimers(); let bus;
    vi.stubGlobal('BroadcastChannel', class { constructor(){bus=this;this.postMessage=vi.fn();this.close=vi.fn();} });
    joinAirspace('test-room','Test Pilot');
    expect(useAirspaceStore.getState().room).toBe('test-room');
    bus.onmessage({data:{type:'hello',id:'peer',name:'Second pilot',flight:{x:1,y:10,z:2,yaw:0}}});
    expect(useAirspaceStore.getState().peers.peer.name).toBe('Second pilot');
    expect(bus.postMessage).toHaveBeenCalled();
    vi.advanceTimersByTime(7000); expect(useAirspaceStore.getState().peers).toEqual({});
    expect(validPeer({type:'presence',id:'bad',name:'Invalid',flight:{x:NaN,y:0,z:0,yaw:0}})).toBe(false);
    leaveAirspace(); expect(bus.close).toHaveBeenCalled();
  });
});
