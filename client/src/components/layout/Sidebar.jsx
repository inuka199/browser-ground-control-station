/**
 * components/layout/Sidebar.jsx
 * Left-hand navigation sidebar.
 * Active item is determined by react-router-dom's NavLink.
 */
import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useConnectionStore } from '../../store/slices/connection.js';

const PRIMARY = [
  {to:'/live',label:'Live station',icon:'◎'},
  {to:'/',label:'Home',icon:'⌂',end:true},
  {to:'/simulator',label:'Fly',icon:'✈'},
  {to:'/garage',label:'Aircraft',icon:'◇'},
  {to:'/challenges',label:'Challenges',icon:'◎'},
  {to:'/recordings',label:'Recordings',icon:'▷'},
];
const TOOLS = [
  {to:'/simulation',label:'Flight setup',icon:'☼'},
  {to:'/action',label:'Commands & waypoints',icon:'⌘'},
  {to:'/environment',label:'Route replay',icon:'↗'},
  {to:'/gadgets',label:'Camera equipment',icon:'⊙'},
  {to:'/multiplayer',label:'Local multiplayer',icon:'♧'},
  {to:'/training',label:'Training',icon:'□'},
  {to:'/views',label:'Camera & display',icon:'▣'},
  {to:'/help',label:'Help',icon:'?'},
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const {pathname}=useLocation();
  const [toolsOpen,setToolsOpen]=useState(()=>TOOLS.some(item=>item.to===pathname));
  const status = useConnectionStore((s) => s.status);

  const statusDot = {
    connected: 'var(--accent-green)',
    connecting: 'var(--accent-yellow)',
    reconnecting: 'var(--accent-yellow)',
    disconnected: 'var(--accent-red)',
  }[status] ?? 'var(--text-muted)';

  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Brand + collapse toggle */}
      <div className="sidebar__brand">
        {!collapsed && (
          <div className="sidebar__brand-text">
            <span className="sidebar__logo-icon">✈</span>
            <span className="sidebar__logo-name">Nexus GCS</span>
          </div>
        )}
        <button
          className="sidebar__collapse-btn"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Connection status pill */}
      <div className="sidebar__status">
        <span
          className="sidebar__status-dot"
          style={{ backgroundColor: statusDot, boxShadow: `0 0 6px ${statusDot}` }}
        />
        {!collapsed && (
          <span className="sidebar__status-label">
            {status === 'connected' ? 'Bridge Online' : status === 'disconnected' ? 'Bridge Offline' : 'Connecting…'}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="sidebar__nav">
        {PRIMARY.map(({to,label,icon,end})=><NavLink key={to} to={to} aria-label={label} end={end} title={label} className={({isActive})=>'sidebar__nav-item'+(isActive?' sidebar__nav-item--active':'')}><span className="sidebar__nav-icon">{icon}</span>{!collapsed && <span className="sidebar__nav-label">{label}</span>}</NavLink>)}
        <button className="sidebar__tools-toggle" aria-expanded={toolsOpen} aria-controls="extra-tools" onClick={()=>setToolsOpen(!toolsOpen)}>{collapsed ? '⋯' : 'More tools'} <span>{toolsOpen?'−':'+'}</span></button>
        {toolsOpen && <div id="extra-tools">{TOOLS.map(({to,label,icon})=><NavLink key={to} to={to} aria-label={label} title={label} className={({isActive})=>'sidebar__nav-item'+(isActive?' sidebar__nav-item--active':'')}><span className="sidebar__nav-icon">{icon}</span>{!collapsed && <span className="sidebar__nav-label">{label}</span>}</NavLink>)}</div>}
      </nav>

      {/* Bottom version badge */}
      {!collapsed && (
        <div className="sidebar__footer">
          <span className="sidebar__version">Coast & city · 2026.11</span>
        </div>
      )}
    </aside>
  );
}
