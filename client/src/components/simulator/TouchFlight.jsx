import React, { useLayoutEffect, useRef, useCallback } from 'react';

function FlightStick({ name, onAxes, horizontal, vertical, caption }) {
  const pointer = useRef(null);
  const pad = useRef(null);
  const reset = useCallback(() => {
    onAxes(horizontal, vertical, 0, 0);
    pointer.current = null;
    pad.current?.style.removeProperty('--stick-x');
    pad.current?.style.removeProperty('--stick-y');
  }, [onAxes, horizontal, vertical]);
  useLayoutEffect(() => reset, [reset]);
  const move = e => {
    if (e.pointerId !== pointer.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const radius = rect.width * 0.34;
    if (!radius) return;
    const dx = (e.clientX - rect.left - rect.width / 2) / radius;
    const dy = (e.clientY - rect.top - rect.height / 2) / radius;
    const scale = Math.max(1, Math.hypot(dx, dy));
    const x = dx / scale, y = dy / scale;
    onAxes(horizontal, vertical, Math.abs(x) < 0.07 ? 0 : x, Math.abs(y) < 0.07 ? 0 : -y);
    pad.current.style.setProperty('--stick-x', x * radius + 'px');
    pad.current.style.setProperty('--stick-y', y * radius + 'px');
  };
  const release = e => { if (pointer.current === e.pointerId) reset(); };
  return <div className="flight-stick-group">
    <div className="flight-stick" ref={pad} role="group" aria-label={name}
      onPointerDown={e => {
        if (pointer.current !== null || e.button !== 0) return;
        e.preventDefault();
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        move(e);
      }}
      onPointerMove={move} onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
      <i aria-hidden="true" />
    </div>
    <span>{caption}</span>
  </div>;
}

export default function TouchFlight({ onAxes }) {
  return <div className="flight-sticks">
    <FlightStick name="Throttle and yaw" onAxes={onAxes} horizontal="yaw" vertical="throttle" caption="Altitude · Turn"/>
    <FlightStick name="Forward and sideways flight" onAxes={onAxes} horizontal="roll" vertical="pitch" caption="Forward · Strafe"/>
  </div>;
}
