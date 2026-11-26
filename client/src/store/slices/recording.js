import { localId } from '../../services/localId.js';
import { create } from 'zustand';
import { validatePath } from '../../services/flightRecords.js';

const KEY = 'nexus-flight-library';
function readLibrary() {
  try {
    const records = JSON.parse(localStorage.getItem(KEY) || '[]');
    if (!Array.isArray(records)) return [];
    return records.slice(0, 8).flatMap(record => {
      try { return [{ ...record, points: validatePath(record.points) }]; } catch { return []; }
    });
  } catch { return []; }
}
export const useRecordingStore = create((set, get) => ({
  recordings: readLibrary(), lastError: null,
  saveFlight: (points, modelId, source = 'demo', name) => {
    try {
      const path = validatePath(points);
      const stride = Math.max(1, Math.ceil(path.length / 3999));
      const samples = path.filter((_, i) => i % stride === 0);
      if (samples.at(-1) !== path.at(-1)) samples.push(path.at(-1));
      const record = { id: localId(), name: String(name || 'Flight ' + new Date().toLocaleString()).slice(0, 100), createdAt: new Date().toISOString(), modelId, source: ['live', 'plan'].includes(source) ? source : 'demo', points: samples };
      const recordings = [record, ...get().recordings].slice(0, 8);
      localStorage.setItem(KEY, JSON.stringify(recordings));
      set({ recordings, lastError: null }); return record;
    } catch (error) { set({ lastError: 'Flight could not be saved: ' + error.message }); return null; }
  },
  rename: (id, name) => {
    if (!name.trim()) return;
    const recordings = get().recordings.map(record => record.id === id ? { ...record, name: name.trim().slice(0, 100) } : record);
    try { localStorage.setItem(KEY, JSON.stringify(recordings)); set({ recordings, lastError: null }); }
    catch { set({ lastError: 'Storage is full. Export your recordings to keep a copy.' }); }
  },
}));
