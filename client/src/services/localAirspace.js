import { create } from 'zustand';
let channel, timer, localFlight = null;
const id = crypto.randomUUID();
export function validPeer(message) {
  return message && ['presence','leave','hello'].includes(message.type) && typeof message.id === 'string' && message.id.length <= 64 && typeof message.name === 'string' && message.name.length <= 24 && (!message.flight || [message.flight.x,message.flight.y,message.flight.z,message.flight.yaw].every(value => Number.isFinite(value) && Math.abs(value) < 1e7));
}
export const useAirspaceStore = create(() => ({ room: '', name: '', peers: {}, error: '' }));
function broadcast(type = 'presence') {
  if (!channel) return;
  const { name } = useAirspaceStore.getState();
  channel.postMessage({ type, id, name, flight: localFlight });
}
export function leaveAirspace() {
  broadcast('leave'); channel?.close(); channel = null;
  clearInterval(timer); timer = null; localFlight = null;
  useAirspaceStore.setState({ room: '', peers: {} });
}
export function joinAirspace(room, name) {
  if (!/^[a-z0-9-]{1,32}$/i.test(room.trim()) || !name.trim()) { useAirspaceStore.setState({error:'Use a room name with 1–32 letters, numbers or hyphens, and enter a pilot name.'}); return; }
  if (typeof BroadcastChannel === 'undefined') { useAirspaceStore.setState({ error:'This browser does not support local shared sessions.' }); return; }
  leaveAirspace();
  const roomId = room.trim().toLowerCase();
  channel = new BroadcastChannel('nexus-airspace-' + roomId);
  useAirspaceStore.setState({ room: roomId, name: name.trim().slice(0,24), error:'' });
  channel.onmessage = ({data}) => {
    if (!validPeer(data) || data.id === id) return;
    useAirspaceStore.setState(state => {
      const peers = {...state.peers};
      if (data.type === 'leave') delete peers[data.id];
      else if (peers[data.id] || Object.keys(peers).length < 16) peers[data.id] = { id:data.id, name:data.name, flight:data.flight, seenAt:Date.now() };
      return { peers };
    });
    if (data.type === 'hello') broadcast();
  };
  broadcast('hello');
  timer = setInterval(() => {
    broadcast();
    useAirspaceStore.setState(state => ({ peers:Object.fromEntries(Object.entries(state.peers).filter(([,peer]) => Date.now()-peer.seenAt < 6000)) }));
  }, 1000);
}
export function updateLocalFlight(flight) { localFlight = flight; }
if (import.meta.hot) import.meta.hot.dispose(leaveAirspace);
