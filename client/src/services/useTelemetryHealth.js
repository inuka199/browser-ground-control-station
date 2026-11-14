import { useEffect, useState } from 'react';
import { useTelemetryStore } from '../store/slices/telemetry.js';
import { useConnectionStore } from '../store/slices/connection.js';

export function useTelemetryHealth() {
  const data = useTelemetryStore(state => state.data);
  const status = useConnectionStore(state => state.status);
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => { const id = setInterval(() => setNow(performance.now()), 500); return () => clearInterval(id); }, []);
  const fresh = status === 'connected' && data.receivedAt != null && now - data.receivedAt < 5000 && now - data.receivedAt >= 0;
  return { data, status, fresh, now };
}
