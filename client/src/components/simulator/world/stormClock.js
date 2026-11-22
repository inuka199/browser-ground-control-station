const clear = { rain: 0, flash: 0, thunder: 0, strike: null };

// Drive every cue from elapsed simulation seconds, including the sound delay.
export function createStormClock(random = Math.random) {
  const between = (low, high) => low + (high - low) * random();
  let mode, start, end, nextStrike, strike;

  function schedule(at) {
    start = at;
    end = mode === 'storm' ? Infinity : at + between(25, 40);
    nextStrike = at + between(5, 9);
    strike = null;
  }

  return function sample(time, selection = 'auto', reducedMotion = false) {
    if (selection !== mode) {
      mode = selection;
      if (mode === 'auto') schedule(time + between(45, 95));
      if (mode === 'storm') schedule(time);
    }
    if (mode === 'clear') return clear;
    // Process in timestamp order so different render rates see the same weather.
    while (true) {
      if (nextStrike < end - 6 && time >= nextStrike) {
        strike = { at: nextStrike, distance: between(500, 950), angle: between(-0.47, 0.47) };
        nextStrike += between(10, 16);
      } else if (time >= end) {
        schedule(end + between(90, 180));
      } else break;
    }
    if (time < start) return clear;
    const ramp = Math.min(1, (time - start) / 5, (end - time) / 5);
    const rain = ramp * ramp * (3 - 2 * ramp);
    if (!strike) return { ...clear, rain };

    const age = time - strike.at;
    const flash = reducedMotion ? 0 : Math.max(0, 1 - age / 0.45) ** 2;
    const soundAge = age - strike.distance / 343;
    const thunder = soundAge > 0 && soundAge < 3
      ? Math.min(1, soundAge / 0.20) * (1 - soundAge / 3) ** 2 * (500 / strike.distance)
      : 0;
    return { rain, flash, thunder, strike };
  };
}
