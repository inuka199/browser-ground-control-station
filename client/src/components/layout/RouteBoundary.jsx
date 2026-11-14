import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
class PageBoundary extends React.Component {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error) { console.error('Page failed to render:', error); }
  render() {
    if (this.state.error) return <main className="workspace-page"><h1>This page could not load</h1><p>Reload the page to retry, or return to the dashboard.</p><div className="workspace-actions"><button onClick={() => window.location.reload()}>Reload page</button><Link to="/">Dashboard</Link></div></main>;
    return this.props.children;
  }
}
export default function RouteBoundary({ children }) {
  const { pathname } = useLocation();
  useEffect(() => { document.title = (pathname === '/' ? 'Dashboard' : pathname.slice(1).replace(/^./, c => c.toUpperCase())) + ' · Nexus GCS'; window.scrollTo(0,0); }, [pathname]);
  return <PageBoundary key={pathname}>{children}</PageBoundary>;
}
