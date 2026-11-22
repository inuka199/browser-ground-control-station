import { useAudioStore } from '../../store/slices/audio.js';
import { ambienceMix } from './ambienceMix.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

/** Locally synthesized audio: no downloads, autoplay or microphone permission. */
export function createFlightSoundscape(context) {
  const nodes = [], sources = new Set(), cueNodes = new Set();
  const track = node => { nodes.push(node); return node; };
  const start = node => { sources.add(node); node.start(); return node; };
  const gain = (volume = 0) => {
    const node = track(context.createGain()); node.gain.value = volume; return node;
  };
  const master = gain();
  const limiter = track(context.createDynamicsCompressor());
  limiter.threshold.value = -16; limiter.knee.value = 12; limiter.ratio.value = 6;
  master.connect(limiter).connect(context.destination);
  const rotorBus = gain(), ambienceBus = gain(1), cueBus = gain(1);
  rotorBus.connect(master); ambienceBus.connect(master); cueBus.connect(master);
  const rotorFilter = track(context.createBiquadFilter());
  rotorFilter.type = 'lowpass'; rotorFilter.frequency.value = 1400; rotorFilter.Q.value = 0.5;
  rotorFilter.connect(rotorBus);

  // Slightly detuned blade pulses and motor harmonics give each aircraft a body.
  const rotors = Array.from({ length: 6 }, (_, index) => {
    const voice = gain(0.045);
    const oscillator = track(context.createOscillator());
    oscillator.type = 'sawtooth'; oscillator.frequency.value = 100 + index * 1.3;
    oscillator.connect(voice).connect(rotorFilter); start(oscillator);
    return { oscillator, voice };
  });
  const noiseBuffer = context.createBuffer(2, context.sampleRate * 3, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = noiseBuffer.getChannelData(channel);
    let brown = 0;
    for (let i = 0; i < samples.length; i++) {
      brown = (brown + (Math.random() * 2 - 1) * 0.025) / 1.025;
      samples[i] = brown * 3.5;
    }
    // Fade the loop boundary so ambience has no repeating click.
    const fade = Math.floor(context.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      samples[i] *= i / fade;
      samples[samples.length - 1 - i] *= i / fade;
    }
  }
  function noise(type, frequency, bus, buffer = noiseBuffer) {
    const source = track(context.createBufferSource()); source.buffer = buffer; source.loop = true;
    const filter = track(context.createBiquadFilter()); filter.type = type; filter.frequency.value = frequency; filter.Q.value = 0.5;
    const level = gain(); source.connect(filter).connect(level).connect(bus); start(source);
    return { level, filter, source };
  }
  const propWash = noise('bandpass', 700, rotorBus);
  const wind = noise('lowpass', 900, ambienceBus);
  const surf = noise('lowpass', 520, ambienceBus);
  const traffic = noise('bandpass', 220, ambienceBus);
  const breakers = noise('bandpass',1400,ambienceBus);
  const harbour = noise('lowpass',170,ambienceBus);
  const insects = noise('bandpass',4200,ambienceBus);insects.filter.Q.value=12;
  const showerBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const patter = showerBuffer.getChannelData(0);
  let tap = 0;
  for (let i = 0; i < patter.length; i++) {
    tap = Math.random() < 90 / context.sampleRate ? 0.85 : tap * 0.97;
    patter[i] = (Math.random() * 2 - 1) * (0.18 + tap);
  }
  const shower = noise('bandpass', 1900, ambienceBus, showerBuffer);
  const rumble = noise('lowpass', 135, ambienceBus);
  function streetBus() {
    const level=gain();
    const panner=context.createStereoPanner ? track(context.createStereoPanner()) : null;
    if(panner)level.connect(panner).connect(ambienceBus);else level.connect(ambienceBus);
    return {level,panner};
  }
  const pedestrians=streetBus(), vehicles=streetBus();
  const motor=track(context.createOscillator()), motorFilter=track(context.createBiquadFilter()), motorLevel=gain();
  motor.type='sawtooth'; motorFilter.type='lowpass'; motorFilter.Q.value=0.65;
  motor.connect(motorFilter).connect(motorLevel).connect(vehicles.level);start(motor);
  let nextVoice=0,nextStep=0,nextRoadHorn=0;
  // Different loop rates avoid identical recurring swells across the layers.
  [wind,surf,traffic,breakers,harbour,insects].forEach((layer,i)=>{if(layer.source.playbackRate) layer.source.playbackRate.value=0.73+i*0.11;});
  let wasFlying = false, lastWarning = -Infinity, nextBird = 3, nextHorn = 10, nextClank = 5, warningTick = false, disposed = false, silent = true;

  function smooth(parameter, value, seconds = 0.12) {
    parameter.setTargetAtTime(value, context.currentTime, seconds);
  }
  function tone(frequency, endFrequency, duration, volume, type = 'sine', delay = 0, ambient = false, bus = null) {
    const oscillator = context.createOscillator(), level = context.createGain();
    const now = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    level.gain.setValueAtTime(0, now);
    level.gain.linearRampToValueAtTime(volume, now + (ambient && duration>1 ? 0.4 : 0.02));
    level.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(level).connect(bus ?? (ambient ? ambienceBus : cueBus));
    sources.add(oscillator);
    cueNodes.add(level);
    oscillator.onended = () => { sources.delete(oscillator); cueNodes.delete(level); oscillator.disconnect(); level.disconnect(); };
    oscillator.start(now); oscillator.stop(now + duration);
  }
  function tickingClick(frequency, volume, bus=cueBus, duration=0.025) {
    const length=Math.max(1,Math.floor(context.sampleRate*duration));
    const buffer=context.createBuffer(1,length,context.sampleRate), samples=buffer.getChannelData(0);
    for(let i=0;i<length;i++) samples[i]=(Math.random()*2-1)*Math.pow(1-i/length,4);
    const source=context.createBufferSource(), filter=context.createBiquadFilter(), level=context.createGain();
    const now=context.currentTime;
    source.buffer=buffer;filter.type='bandpass';filter.frequency.value=frequency;filter.Q.value=1.4;
    level.gain.setValueAtTime(volume,now);level.gain.exponentialRampToValueAtTime(0.0001,now+duration);
    source.connect(filter).connect(level).connect(bus);
    sources.add(source);cueNodes.add(filter);cueNodes.add(level);
    source.onended=()=>{sources.delete(source);cueNodes.delete(filter);cueNodes.delete(level);source.disconnect();filter.disconnect();level.disconnect();};
    source.start(now);source.stop(now+duration);
  }

  // Short voiced syllables with moving vowel formants suggest conversation.
  function murmur(id, now) {
    const source=context.createOscillator(), level=context.createGain();
    source.type='sawtooth';const pitch=110+(id%5)*17;
    source.frequency.setValueAtTime(pitch,now);
    source.frequency.linearRampToValueAtTime(pitch*1.16,now+0.22);
    source.frequency.linearRampToValueAtTime(pitch*0.91,now+0.55);
    const filters=[[520,740],[1480,1120]].map(([a,b])=>{
      const filter=context.createBiquadFilter();filter.type='bandpass';filter.Q.value=5;
      filter.frequency.setValueAtTime(a,now);filter.frequency.linearRampToValueAtTime(b,now+0.5);
      source.connect(filter).connect(level);cueNodes.add(filter);return filter;
    });
    level.connect(pedestrians.level);cueNodes.add(level);
    for(const [t,v] of [[0,0],[0.045,0.15],[0.18,0.012],[0.27,0.13],[0.39,0.01],[0.45,0.10],[0.58,0]])
      level.gain.linearRampToValueAtTime(v,now+t);
    sources.add(source);source.onended=()=>{
      sources.delete(source);source.disconnect();
      for(const node of [...filters,level]){cueNodes.delete(node);node.disconnect();}
    };
    source.start(now);source.stop(now+0.59);
  }
  function updateStreet(frame,audible) {
    const street=audible && frame.cityLife ? frame.street : null;
    const person=street?.person, car=street?.vehicle, now=context.currentTime;
    for(const [bus,source] of [[pedestrians,person],[vehicles,car]]) {
      smooth(bus.level.gain,source?.gain??0,0.035);
      if(bus.panner)smooth(bus.panner.pan,source?.pan??0,0.08);
    }
    if(person && now>=nextVoice) {murmur(person.actor.id,now);nextVoice=now+2.1+Math.random()*2.8;}
    if(person?.actor.walking && now>=nextStep) {
      tickingClick(680,0.085,pedestrians.level,0.065);
      nextStep=now+(person.actor.style==='jogger'?0.30:0.54);
    }
    if(!car)return;
    const a=car.actor, rev=clamp(a.acceleration,0,3);
    const idle=a.kind==='bus'?40:a.kind==='tukTuk'?92:62;
    smooth(motor.frequency,idle+clamp(a.speed,0,16)*4+rev*10);
    smooth(motorFilter.frequency,250+clamp(a.speed,0,16)*16+rev*140);
    smooth(motorLevel.gain,0.045+rev*0.01);
    if(now>=nextRoadHorn) {
      const hz=a.kind==='bus'?237:a.kind==='tukTuk'?515:405;
      tone(hz,hz*0.98,0.28,0.085,'square',0,true,vehicles.level);
      tone(hz*1.25,hz*1.23,0.25,0.036,'sawtooth',0.02,true,vehicles.level);
      nextRoadHorn=now+8+Math.random()*7;
    }
  }

  function setVolume({ muted = false, volume = 0.45 } = {}) {
    if (!disposed) smooth(master.gain, silent || muted ? 0 : clamp(volume, 0, 1), 0.025);
  }
  return {
    setVolume,
    effect(type, distance = 0, settings = {}) {
      if(disposed || silent || context.state!=='running' || settings.muted || settings.volume===0) return;
      const attenuation=1/(1+Math.max(0,distance)/45);
      if(type==='detonation-warning') {
        const progress=clamp(settings.progress,0,1);
        const frequency=(warningTick ? 1450 : 2050)+progress*620;
        const volume=(0.13+progress*0.08)*attenuation;
        warningTick=!warningTick;
        tickingClick(frequency,volume);
        tone(frequency*0.42,frequency*0.24,0.035,volume*0.32,'triangle',0.002);
      } else if(type==='explosion' || type==='crash') {
        tone(100,28,0.9,0.35*attenuation,'triangle');
        const source=context.createBufferSource(),filter=context.createBiquadFilter(),level=context.createGain();
        source.buffer=noiseBuffer;filter.type='lowpass';filter.frequency.setValueAtTime(1800,context.currentTime);filter.frequency.exponentialRampToValueAtTime(90,context.currentTime+1.3);
        level.gain.setValueAtTime(0.8*attenuation,context.currentTime);level.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+1.5);
        source.connect(filter).connect(level).connect(cueBus);sources.add(source);cueNodes.add(filter);cueNodes.add(level);
        source.onended=()=>{sources.delete(source);cueNodes.delete(filter);cueNodes.delete(level);source.disconnect();filter.disconnect();level.disconnect();};
        source.start();source.stop(context.currentTime+1.6);
      } else if(type==='pickup') tone(480,760,0.25,0.08);
      else if(type==='delivery' || type==='complete') {tone(520,1040,0.45,0.075);tone(780,1560,0.6,0.04);}
    },
    update(frame, settings) {
      if (disposed || context.state !== 'running') return;
      silent = false;
      setVolume(settings);
      const flying = Boolean(frame.flying), time = frame.time || 0;
      const speed = clamp(frame.speed, 0, 60), climb = clamp(frame.climb, -12, 12);
      const load = clamp(0.3 + speed / 90 + climb / 32, 0.1, 1);
      const altitude = clamp(frame.altitude, 0, 20000);
      const proximity = 1 / (1 + clamp(frame.cameraDistance, 0, 20000) / 30);
      const base = frame.modelId === 'racing-quad' ? 155 : frame.modelId === 'hexacopter' ? 72 : 105;
      rotors.forEach(({ oscillator, voice }, index) => {
        smooth(oscillator.frequency, base * (0.72 + load * 0.65) * (index % 2 ? 2 : 1) + index * 1.3);
        smooth(voice.gain, index >= 4 && frame.modelId !== 'hexacopter' ? 0 : 0.045);
      });
      smooth(rotorBus.gain, flying ? proximity : 0, flying ? 0.25 : 0.45);
      smooth(rotorFilter.frequency, 950 + load * 1300);
      smooth(propWash.level.gain, 0.12 + load * 0.16);
      const mix=ambienceMix(frame);
      smooth(shower.level.gain, 0.46 * (frame.weather?.rain ?? 0), 0.16);
      smooth(rumble.level.gain, 1.3 * (frame.weather?.thunder ?? 0), 0.08);
      const gust=0.75+0.15*Math.sin(time*0.23)+0.1*Math.sin(time*0.73);
      smooth(wind.level.gain, (0.035 + Math.min(altitude / 2000, 0.1) + speed * 0.003)*gust);
      smooth(wind.filter.frequency, (600 + speed * 35)*gust);
      const swell=Math.pow(0.5+0.5*Math.sin(time*0.58+Math.sin(time*0.13)),2);
      smooth(surf.level.gain,(0.07+swell*0.15)*mix.coast,0.4);
      smooth(surf.filter.frequency,240+500*swell,0.4);
      smooth(breakers.level.gain,Math.max(0,swell-0.55)*0.13*mix.coast,0.3);
      smooth(traffic.level.gain,(0.05+0.025*Math.sin(time*0.31))*mix.traffic,0.4);
      smooth(traffic.filter.frequency,140+100*(0.5+0.5*Math.sin(time*0.22)),0.5);
      smooth(harbour.level.gain,(0.065+0.015*Math.sin(time*0.9))*mix.harbour);
      const chirp=Math.pow(Math.max(0,Math.sin(time*18)),7)*(0.35+0.65*Math.max(0,Math.sin(time*0.7)));
      smooth(insects.level.gain,chirp*0.055*mix.night,0.012);

      // Cues and continuous layers share the same volume/mute/pause path.
      const audible = !settings?.muted && (settings?.volume ?? 0.45) > 0;
      updateStreet(frame,audible);
      if (audible && flying && !wasFlying) tone(420, 740, 0.22, 0.055);
      if (audible && !flying && wasFlying) tone(540, 320, 0.25, 0.04);
      wasFlying = flying;
      const interval = frame.distance < 3 ? 0.3 : 0.8;
      if (audible && flying && frame.distance < 10 && context.currentTime - lastWarning > interval) {
        tone(frame.distance < 3 ? 920 : 660, 600, 0.13, 0.055, 'triangle');
        lastWarning = context.currentTime;
      }
      if (context.currentTime>=nextBird) {
        if(audible && frame.cityLife && mix.birds>0.08) {
          const pitch=1400+Math.random()*650,volume=0.025*mix.birds;
          tone(pitch,pitch*1.45,0.18,volume,'sine',0,true);
          tone(pitch*1.3,pitch*0.9,0.28,volume*0.8,'sine',0.25,true);
          if(mix.coast>0.5) tone(1050,720,0.65,volume*0.6,'sine',0.7,true);
        }
        nextBird=context.currentTime+7+Math.random()*12;
      }
      if(context.currentTime>=nextHorn) {
        if(audible && mix.harbour>0.05) {tone(110,107,2.8,0.07*mix.harbour,'sine',0,true);tone(164,160,2.6,0.035*mix.harbour,'sine',0.12,true);}
        nextHorn=context.currentTime+28+Math.random()*25;
      }
      if(context.currentTime>=nextClank) {
        if(audible && mix.harbour>0.15) {tone(420,170,0.35,0.018*mix.harbour,'triangle',0,true);tone(780,380,0.22,0.009*mix.harbour,'sine',0.08,true);}
        nextClank=context.currentTime+5+Math.random()*9;
      }
    },
    silence() {
      if (disposed || silent) return;
      silent = true;
      smooth(master.gain, 0, 0.015);
      // Stop transient calls as well as muting the loop: no old horn resumes later.
      for(const source of [...sources]) if(source.onended) {try{source.stop();}catch{/* already ended */}source.onended();}
    },
    dispose() {
      if (disposed) return;
      disposed = true; master.gain.cancelScheduledValues(context.currentTime); master.gain.value = 0;
      sources.forEach(source => { try { source.stop(); } catch { /* A cue may have already ended. */ } source.disconnect(); });
      sources.clear(); cueNodes.forEach(node => node.disconnect()); cueNodes.clear(); nodes.forEach(node => node.disconnect());
    },
  };
}

let context, soundscape, unsubscribe, resuming;

/** Called only by a keyboard/pointer gesture, respecting browser autoplay rules. */
export async function enableFlightAudio() {
  try {
    if (!context || context.state === 'closed') {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) { useAudioStore.getState().setStatus('unavailable'); return; }
      context = new AudioContext();
      const current = context;
      context.onstatechange = () => {
        if (context === current) useAudioStore.getState().setStatus(current.state);
      };
      soundscape = createFlightSoundscape(context);
      unsubscribe = useAudioStore.subscribe(settings => soundscape?.setVolume(settings));
    }
    if (context.state !== 'running') {
      resuming ||= context.resume().finally(() => { resuming = null; });
      await resuming;
    }
    if (context) useAudioStore.getState().setStatus(context.state);
  } catch {
    useAudioStore.getState().setStatus('unavailable');
  }
}

export function updateFlightAudio(frame) { soundscape?.update(frame, useAudioStore.getState()); }
export function playFlightEffect(type,distance=0,options={}) { soundscape?.effect(type,distance,{...useAudioStore.getState(),...options}); }
export function stopFlightAudio() { soundscape?.silence(); }
export function disposeFlightAudio() {
  unsubscribe?.(); unsubscribe = null;
  soundscape?.dispose(); soundscape = null;
  const previous = context; context = null; resuming = null;
  if (previous) { previous.onstatechange = null; previous.close().catch(() => {}); }
  useAudioStore.getState().setStatus('idle');
}

if (import.meta.hot) import.meta.hot.dispose(disposeFlightAudio);
