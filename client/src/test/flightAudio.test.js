import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFlightSoundscape, enableFlightAudio, disposeFlightAudio } from '../components/simulator/flightAudio.js';
import { useAudioStore } from '../store/slices/audio.js';
import { ambienceMix } from '../components/simulator/ambienceMix.js';

// Exercise the audio graph without depending on a host sound device.
function audioContext() {
  const nodes = [];
  const parameter = () => ({
    value: 0,
    setTargetAtTime: vi.fn(function (value) { this.value = value; }),
    setValueAtTime: vi.fn(function (value) { this.value = value; }),
    linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(),
  });
  function node(kind) {
    const result = {
      kind, connections: [], gain: parameter(), frequency: parameter(), Q: parameter(), threshold: parameter(), knee: parameter(), ratio: parameter(),
      connect: vi.fn(function (target) { this.connections.push(target); return target; }),
      disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    };
    nodes.push(result); return result;
  }
  const context = {
    nodes, currentTime: 0, sampleRate: 8000, state: 'running', destination: node('destination'),
    createGain: () => node('gain'), createOscillator: () => node('oscillator'),
    createBufferSource: () => node('noise'), createBiquadFilter: () => node('filter'), createDynamicsCompressor: () => node('limiter'),
    createBuffer: (channels, length) => {
      const data = Array.from({ length: channels }, () => new Float32Array(length));
      return { getChannelData: channel => data[channel] };
    },
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
  };
  return context;
}

const flight = { flying: true, speed: 0, climb: 0, altitude: 12, cameraDistance: 15, coastDistance: 100, distance: Infinity, daylight: 1, cityLife: true, modelId: 'compact-quad', time: 1 };
const settings = { muted: false, volume: 0.45 };
const masterOf = context => context.nodes.find(node => node.connections.some(target => target.kind === 'limiter'));

afterEach(() => {
  disposeFlightAudio();
  vi.unstubAllGlobals();
  useAudioStore.setState({ muted: false, volume: 0.45, status: 'idle' });
});

describe('flight soundscape', () => {
  it('mixes rain and thunder independently, through the same pause and mute controls as flight audio', () => {
    const context=audioContext(), sound=createFlightSoundscape(context);
    const levelFor=frequency=>context.nodes.find(n=>n.kind==='filter'&&n.frequency.value===frequency).connections[0].gain;
    const rain=levelFor(1900), thunder=levelFor(135), master=masterOf(context);
    sound.update({...flight,weather:{rain:0.8,thunder:0}},settings);
    expect(rain.value).toBeGreaterThan(0);expect(thunder.value).toBe(0);
    sound.update({...flight,weather:{rain:1,thunder:0.8}},settings);
    expect(thunder.value).toBeGreaterThan(0);
    sound.setVolume({...settings,muted:true});expect(master.gain.value).toBe(0);
    sound.silence();expect(master.gain.value).toBe(0);
    sound.update(flight,settings);expect(rain.value).toBe(0);expect(thunder.value).toBe(0);
    sound.dispose();
  });
  it('separates harbour, coastline, city, day and night and fades with listener height',()=>{
    const port=ambienceMix({...flight,x:-400,z:-800,altitude:1,coastDistance:0});
    const inland=ambienceMix({...flight,x:700,z:400,altitude:1,coastDistance:845});
    const high=ambienceMix({...flight,x:-400,z:-800,altitude:1500});
    const night=ambienceMix({...flight,daylight:0});
    expect(port.harbour).toBeGreaterThan(inland.harbour*10);expect(port.coast).toBeGreaterThan(inland.coast*10);
    expect(high.harbour).toBeLessThan(port.harbour/100);expect(night.birds).toBe(0);expect(night.night).toBeGreaterThan(0.8);
    expect(ambienceMix({...flight,cityLife:false}).traffic).toBe(0);
  });
  it('plays harbour cues near the port, suppresses daytime birds at night and cancels transient sounds on pause',()=>{
    const context=audioContext(),sound=createFlightSoundscape(context);
    sound.update({...flight,flying:false,daylight:0,x:-400,z:-800},settings);
    const count=context.nodes.filter(n=>n.kind==='oscillator').length;
    context.currentTime=11;sound.update({...flight,flying:false,daylight:0,x:-400,z:-800},settings);
    const cues=context.nodes.filter(n=>n.kind==='oscillator').slice(count);
    expect(cues.length).toBeGreaterThanOrEqual(2);
    expect(cues.some(n=>n.frequency.value>=1400)).toBe(false);
    sound.silence();for(const cue of cues) expect(cue.stop).toHaveBeenCalled();
    sound.dispose();
  });
  it('plays explosion and delivery effects through the same mute and pause path', () => {
    const context=audioContext(),sound=createFlightSoundscape(context);
    sound.update(flight,settings);
    const before=context.nodes.length;
    sound.effect('explosion',10,settings);sound.effect('delivery',0,settings);
    expect(context.nodes.length).toBeGreaterThan(before);
    const active=context.nodes.length;
    sound.effect('crash',0,{...settings,muted:true});expect(context.nodes).toHaveLength(active);
    sound.silence();sound.effect('explosion',0,settings);expect(context.nodes).toHaveLength(active);
    sound.dispose();
    for(const source of context.nodes.filter(node=>['oscillator','noise'].includes(node.kind))) expect(source.stop).toHaveBeenCalled();
  });
  it('spools motors with flight load, changes aircraft voice and attenuates camera distance', () => {
    const context = audioContext(), sound = createFlightSoundscape(context);
    const rotor = context.nodes.find(node => node.kind === 'oscillator');
    const rotorBus = rotor.connections[0].connections[0].connections[0];
    sound.update({ ...flight, flying: false }, settings);
    expect(rotorBus.gain.value).toBe(0);
    sound.update(flight, settings);
    const hoverPitch = rotor.frequency.value, closeVolume = rotorBus.gain.value;
    expect(closeVolume).toBeGreaterThan(0);
    sound.update({ ...flight, climb: 8, speed: 20 }, settings);
    expect(rotor.frequency.value).toBeGreaterThan(hoverPitch);
    sound.update({ ...flight, cameraDistance: 100 }, settings);
    expect(rotorBus.gain.value).toBeLessThan(closeVolume);
    sound.update({ ...flight, modelId: 'hexacopter' }, settings);
    expect(rotor.frequency.value).toBeLessThan(hoverPitch);
    sound.update({ ...flight, modelId: 'racing-quad' }, settings);
    expect(rotor.frequency.value).toBeGreaterThan(hoverPitch);
    sound.dispose();
  });

  it('routes every layer and alert through mute/volume, keeps pause silent, and resumes cleanly', () => {
    const context = audioContext(), sound = createFlightSoundscape(context), master = masterOf(context);
    sound.update({ ...flight, distance: 2 }, settings);
    expect(master.gain.value).toBe(0.45);
    for (const source of context.nodes.filter(node => ['oscillator', 'noise'].includes(node.kind))) {
      let current = source;
      while (current !== master && current.connections[0]) current = current.connections[0];
      expect(current).toBe(master);
    }
    sound.setVolume({ ...settings, muted: true }); expect(master.gain.value).toBe(0);
    sound.setVolume({ ...settings, volume: 0.2 }); expect(master.gain.value).toBe(0.2);
    sound.silence(); expect(master.gain.value).toBe(0);
    sound.setVolume({ ...settings, volume: 0.8 }); expect(master.gain.value).toBe(0);
    sound.update(flight, settings); expect(master.gain.value).toBe(0.45);
    sound.update(flight, { ...settings, volume: 0 }); expect(master.gain.value).toBe(0);
    sound.dispose();
  });

  it('fades surf and traffic with height, respects city life and retains wind', () => {
    const context = audioContext(), sound = createFlightSoundscape(context);
    const layers = context.nodes.filter(node => node.kind === 'noise').map(node => node.connections[0].connections[0]);
    const [, wind, surf, traffic] = layers;
    sound.update({ ...flight, altitude: 5 }, settings);
    const lowSurf = surf.gain.value, lowTraffic = traffic.gain.value, lowWind = wind.gain.value;
    sound.update({ ...flight, altitude: 1500 }, settings);
    expect(surf.gain.value).toBeLessThan(lowSurf / 100);
    expect(traffic.gain.value).toBeLessThan(lowTraffic / 100);
    expect(wind.gain.value).toBeGreaterThan(lowWind);
    sound.update({ ...flight, cityLife: false }, settings);
    expect(traffic.gain.value).toBe(0);
    sound.dispose();
  });

  it('rate-limits proximity cues and releases sources on disposal, including active cues', () => {
    const context = audioContext(), sound = createFlightSoundscape(context);
    const warnings = () => context.nodes.filter(node => node.kind === 'oscillator' && node.type === 'triangle');
    sound.update({ ...flight, distance: 8 }, settings);
    expect(warnings()).toHaveLength(1);
    context.currentTime = 0.2; sound.update({ ...flight, distance: 8 }, settings);
    expect(warnings()).toHaveLength(1);
    context.currentTime = 0.9; sound.update({ ...flight, distance: 8 }, settings);
    expect(warnings()).toHaveLength(2);
    context.currentTime = 2; sound.update({ ...flight, distance: 2 }, { ...settings, muted: true });
    expect(warnings()).toHaveLength(2);
    sound.dispose(); sound.dispose();
    for (const node of context.nodes.filter(node => node.kind !== 'destination')) expect(node.disconnect).toHaveBeenCalled();
    for (const source of context.nodes.filter(node => ['oscillator', 'noise'].includes(node.kind))) expect(source.stop).toHaveBeenCalled();
    expect(masterOf(context).gain.value).toBe(0);
    const count = context.nodes.length;
    sound.update(flight, settings); expect(context.nodes).toHaveLength(count);
  });

  it('synthesizes footsteps, vowel sounds, distinct horn tones and an engine that revs on acceleration',()=>{
    const ctx=audioContext(),sound=createFlightSoundscape(ctx);
    const frame={...flight,flying:false,street:{person:{gain:0.7,pan:-0.5,actor:{id:2,walking:true,style:'jogger'}},
      vehicle:{gain:0.6,pan:0.5,actor:{kind:'bus',speed:4,acceleration:0}}}};
    const motor=ctx.nodes.filter(n=>n.kind==='oscillator').at(-1);
    const baseCount=ctx.nodes.length;
    sound.update(frame,settings);
    const created=ctx.nodes.slice(baseCount),pitch=motor.frequency.value;
    expect(created.filter(n=>n.kind==='filter'&&n.type==='bandpass')).toHaveLength(3);
    expect(created.some(n=>n.kind==='noise')).toBe(true);
    expect(created.some(n=>n.kind==='oscillator'&&n.type==='square'&&n.frequency.value===237)).toBe(true);
    const count=ctx.nodes.length;
    ctx.currentTime=0.1;frame.street.vehicle.actor.acceleration=2;
    sound.update(frame,settings);expect(ctx.nodes).toHaveLength(count);expect(motor.frequency.value).toBeGreaterThan(pitch);
    const engineBus=motor.connections[0].connections[0].connections[0];
    sound.update({...frame,street:null},settings);expect(engineBus.gain.value).toBe(0);
    sound.update(frame,{...settings,muted:true});expect(engineBus.gain.value).toBe(0);
    sound.silence();sound.dispose();
    for(const node of created.filter(n=>n.kind==='oscillator'||n.kind==='noise'))expect(node.stop).toHaveBeenCalled();
  });
});

describe('browser audio lifecycle', () => {
  it('unlocks a single context on interaction and closes it when leaving the simulator', async () => {
    const context = audioContext(); context.state = 'suspended';
    const constructor = vi.fn(function () { return context; });
    vi.stubGlobal('AudioContext', constructor);
    await Promise.all([enableFlightAudio(), enableFlightAudio()]);
    expect(constructor).toHaveBeenCalledTimes(1);
    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(useAudioStore.getState().status).toBe('running');
    disposeFlightAudio();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(useAudioStore.getState().status).toBe('idle');
  });

  it('handles unavailable or rejected audio without breaking flight', async () => {
    vi.stubGlobal('AudioContext', undefined); vi.stubGlobal('webkitAudioContext', undefined);
    await enableFlightAudio(); expect(useAudioStore.getState().status).toBe('unavailable');
    const context = audioContext(); context.state = 'suspended';
    context.resume.mockRejectedValue(new Error('Audio blocked'));
    vi.stubGlobal('AudioContext', function () { return context; });
    await expect(enableFlightAudio()).resolves.toBeUndefined();
    expect(useAudioStore.getState().status).toBe('unavailable');
  });
});
