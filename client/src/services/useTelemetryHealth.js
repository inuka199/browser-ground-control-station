import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useConnectionStore } from '../store/slices/connection.js';
import { isFreshPosition, isFreshTelemetry } from './telemetryValidation.js';

export function useTelemetryHealth() {
  const data = useTelemetryStore(state => state.data);
  const positionData = useTelemetryStore(state => state.positionData);
  const status = useConnectionStore(state => state.status);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const refresh = () => setNow(performance.now());
    // Update the clock in the same batch as a frame, including between timer ticks.
    const unsubscribe = useTelemetryStore.subscribe(refresh);
    const id = setInterval(refresh, 500);
    return () => { unsubscribe(); clearInterval(id); };
  }, []);
  const fresh = status === 'connected' && isFreshTelemetry(data, now);
  const positionFresh = status === 'connected' && isFreshPosition(positionData, now);
  return { data, status, fresh, positionData, positionFresh, now };
}
