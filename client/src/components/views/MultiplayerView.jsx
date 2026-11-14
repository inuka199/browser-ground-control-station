import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from './PageHeader.jsx';
import { useAirspaceStore, joinAirspace, leaveAirspace } from '../../services/localAirspace.js';
export default function MultiplayerView() {
  const session = useAirspaceStore(), [room,setRoom] = useState('coastal-flight'), [name,setName] = useState('Pilot');
  return <section className="workspace-page"><PageHeader title="Local multiplayer">Share the coastal airspace between tabs in this browser. Each pilot flies independently.</PageHeader><div className="workspace-grid"><article className="workspace-card"><h2>{session.room ? 'Joined ' + session.room : 'Join an airspace'}</h2>
    {!session.room ? <form onSubmit={e => {e.preventDefault();joinAirspace(room,name);}}><label>Room name<input value={room} maxLength="32" onChange={e=>setRoom(e.target.value)} required/></label><label>Pilot name<input value={name} maxLength="24" onChange={e=>setName(e.target.value)} required/></label><button type="submit">Join room</button></form> : <><p>Flying as {session.name}. Open this room in another tab to see its aircraft here.</p><div className="workspace-actions"><Link className="workspace-button" to="/simulator">Enter shared flight</Link><button onClick={()=>window.open('/multiplayer','_blank','noopener')}>Open another pilot tab</button><button onClick={leaveAirspace}>Leave room</button></div></>}
    {session.error && <p role="alert">{session.error}</p>}<p>Local sessions use this browser's same-origin messaging. They do not connect to other devices or a remote multiplayer server. Aircraft do not collide with each other.</p></article>
    <article className="workspace-card"><h2>Pilots in this room</h2>{!session.room ? <p>Join a room to see participants.</p> : <><p>{session.name} · You</p>{Object.values(session.peers).map(peer=><p key={peer.id}>{peer.name} · {peer.flight ? peer.flight.y.toFixed(1)+' m altitude' : 'In lobby'}</p>)}{!Object.keys(session.peers).length && <p>Waiting for another pilot tab to join.</p>}</>}</article></div></section>;
}
