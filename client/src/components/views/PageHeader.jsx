import React from 'react';
import './Workspace.css';
export default function PageHeader({ title, children, kicker = 'NEXUS FLIGHT STATION' }) {
  return <header><span className="workspace-kicker">{kicker}</span><h1>{title}</h1><p>{children}</p></header>;
}
